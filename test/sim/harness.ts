/**
 * Drives the real OutreachOS server code (worker, API routes, tracking endpoints) against
 * the in-memory database and mailbox on a simulated clock, recording a readable timeline.
 *
 * Addresses come from SIM_LEAD_EMAIL / SIM_SENDER_EMAIL when set (nothing is ever sent —
 * the mailbox is fake), otherwise from neutral placeholders.
 */
import { readFileSync } from "node:fs";
import { formatInTimeZone } from "date-fns-tz";
import { NextRequest } from "next/server";
import { vi } from "vitest";
import { POST as approvalsPOST } from "@/app/api/approvals/route";
import { POST as importPOST } from "@/app/api/leads/import/route";
import { PATCH as leadsPATCH } from "@/app/api/leads/route";
import { GET as clickGET } from "@/app/api/track/click/route";
import { GET as openGET } from "@/app/api/track/open/route";
import { POST as portfolioPOST } from "@/app/api/track/portfolio/route";
import { processQueue } from "@/lib/server/sequencer";
import { touchLabel } from "@/lib/meta";
import type { EmailLog, ImportResponse, Lead, QueueReport, SequenceTemplate, SystemSettings, TrackingEvent } from "@/lib/types";
import { FakeGmail } from "./fake-gmail";
import { FakeSupabase } from "./fake-supabase";
import { state } from "./state";

export const SENDER = process.env.SIM_SENDER_EMAIL || "sender@example.com";
export const LEAD_EMAIL = process.env.SIM_LEAD_EMAIL || "lead@example.com";
/** Plus-address variant of the lead (same inbox in Gmail) for multi-lead scenarios. */
export const alias = (tag: string) => LEAD_EMAIL.replace("@", `+${tag}@`);

export const APP = "https://outreachos.houseofnamus.com";
export const PORTFOLIO_ORIGIN = "https://sumandebnath.houseofnamus.com";
export const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
export const GMAIL_PROXY_UA = "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)";
export const SCANNER_UA = "Mozilla/5.0 (compatible; Mimecast URL Protect)";

const MIN = 60_000;
const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/**
 * Templates exactly as the database ends up after the migrations: the 001 seed, then the
 * latest copy migration (012, incl. role-track Touch 1 overrides) upserted on top — so the
 * simulation sends the real copy.
 */
function seededTemplates(): Omit<SequenceTemplate, "id" | "created_at">[] {
  const re = /\('(\w+)', (\d), '(\w+)',\n\$t\$([\s\S]*?)\$t\$,\n\$t\$([\s\S]*?)\$t\$,\n(\d+), (true|false)\)/g;
  const byKey = new Map<string, Omit<SequenceTemplate, "id" | "created_at">>();
  for (const file of ["001_init_outreach_os.sql", "012_job_seeker_copy.sql"]) {
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8").replace(/\r\n/g, "\n");
    for (const m of sql.matchAll(re)) {
      byKey.set(`${m[1]}:${m[2]}:${m[3]}`, {
        role_track: m[1] as SequenceTemplate["role_track"],
        touch_number: Number(m[2]) as SequenceTemplate["touch_number"],
        branch_variant: m[3] as SequenceTemplate["branch_variant"],
        subject_template: m[4],
        body_template: m[5],
        wait_business_days: Number(m[6]),
        same_thread: m[7] === "true",
      });
    }
  }
  return [...byKey.values()];
}

function defaultSettings(): Omit<SystemSettings, "updated_at"> {
  return {
    id: 1,
    send_provider: "GMAIL",
    execution_mode: "AUTO_PILOT",
    daily_send_limit: 45,
    min_delay_minutes: 3,
    max_delay_minutes: 6,
    sender_name: "Suman Debnath",
    sender_email: SENDER,
    portfolio_base_url: "https://sumandebnath.houseofnamus.com",
    resume_url: "https://sumandebnath.houseofnamus.com/resume",
    gmail_refresh_token: "sim-refresh-token",
    india_window_start: 10,
    india_window_end: 18,
    us_window_start: 9,
    us_window_end: 17,
    global_window_start: 9,
    global_window_end: 18,
    archive_after_business_days: 4,
    reengage_after_days: 60,
    next_dispatch_at: null,
    last_queue_run_at: null,
    last_digest_on: "1970-01-01",
    skip_holidays: true,
    extra_blackout_dates: null,
    // warm-up off by default so throughput scenarios aren't capped; S21 turns it on
    warmup_enabled: false,
    warmup_started_on: null,
    auto_resume_ooo: true,
    ...signatureDefaults(),
  };
}

/** linkedin_url (migration 011) + the current email_signature (migration 012). */
function signatureDefaults(): Pick<SystemSettings, "linkedin_url" | "email_signature"> {
  const m11 = readFileSync("supabase/migrations/011_signature_and_link_labels.sql", "utf8").replace(/\r\n/g, "\n");
  const m12 = readFileSync("supabase/migrations/012_job_seeker_copy.sql", "utf8").replace(/\r\n/g, "\n");
  return {
    linkedin_url: m11.match(/linkedin_url text default '([^']+)'/)![1],
    email_signature: m12.match(/set email_signature = \$sig\$([\s\S]*?)\$sig\$/)![1],
  };
}

export function fmt(d: Date | string, tz = "Asia/Kolkata", label = "IST"): string {
  return `${formatInTimeZone(new Date(d), tz, "EEE dd MMM yyyy HH:mm")} ${label}`;
}

export interface LeadInput {
  email?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  target_role_opening?: string;
  geo_region?: string;
  role_track?: string;
  custom_icebreaker?: string;
}

export const defaultLead = (overrides: LeadInput = {}): LeadInput => ({
  email: LEAD_EMAIL,
  first_name: "Suman",
  last_name: "Test",
  company_name: "Acme AI",
  target_role_opening: "AI Product Marketing Manager",
  geo_region: "INDIA",
  ...overrides,
});

export class Sim {
  readonly db = new FakeSupabase();
  readonly gmail = new FakeGmail(SENDER);
  readonly timeline: string[] = [];
  cronRuns = 0;

  constructor(
    readonly title: string,
    start: string,
    settings: Partial<SystemSettings> = {},
    readonly tz: { zone: string; label: string } = { zone: "Asia/Kolkata", label: "IST" },
  ) {
    state.db = this.db;
    state.gmail = this.gmail;
    state.after = [];
    state.telegram = [];
    state.groq = null;
    state.groqCalls = 0;
    vi.setSystemTime(new Date(start));
    this.db.tables.system_settings.push({ ...defaultSettings(), ...settings, updated_at: new Date().toISOString() });
    for (const t of seededTemplates()) this.db.tables.sequence_templates.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...t });
  }

  get now(): Date {
    return new Date();
  }
  note(text: string) {
    this.timeline.push(`| ${fmt(this.now, this.tz.zone, this.tz.label)} | ${text} |`);
  }
  advance(ms: number) {
    vi.setSystemTime(new Date(Date.now() + ms));
  }

  lead(email = LEAD_EMAIL): Lead {
    const l = this.db.tables.leads.find((r) => r.email === email);
    if (!l) throw new Error(`no lead ${email}`);
    return structuredClone(l) as unknown as Lead;
  }
  logs(email = LEAD_EMAIL): EmailLog[] {
    const id = this.lead(email).id;
    return (this.db.tables.email_logs.filter((r) => r.lead_id === id) as unknown as EmailLog[]).sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  }
  sentLogs(email = LEAD_EMAIL): EmailLog[] {
    return this.logs(email).filter((l) => l.status === "SENT" || l.status === "BOUNCED");
  }
  events(email = LEAD_EMAIL): TrackingEvent[] {
    const id = this.lead(email).id;
    return this.db.tables.tracking_events.filter((r) => r.lead_id === id) as unknown as TrackingEvent[];
  }
  touches(email = LEAD_EMAIL): string[] {
    return this.sentLogs(email).map((l) => touchLabel(l.touch_number, l.branch_variant));
  }

  private async flushAfter() {
    while (state.after.length) await state.after.shift()!();
  }

  async importLead(input: LeadInput = defaultLead()): Promise<ImportResponse> {
    const res = await importPOST(new Request(`${APP}/api/leads/import`, { method: "POST", body: JSON.stringify({ rows: [input] }) }));
    const body = (await res.json()) as ImportResponse;
    const r = body.results[0];
    this.note(
      r.status === "NEW"
        ? `Imported **${r.lead.email}** (${r.lead.company_name}, ${r.lead.geo_region}, track ${r.lead.role_track}) → LEAD_QUEUED`
        : `Import of ${input.email}: **${r.status}**${"locked" in r && r.locked ? " (locked)" : ""}`,
    );
    return body;
  }

  /** Telegram messages captured so far (HTML text). */
  get telegram(): string[] {
    return state.telegram;
  }

  /** One run of the master worker, as the 10-minute cron would trigger it. */
  async cron(): Promise<QueueReport> {
    this.cronRuns++;
    const before = this.db.tables.leads.map((l) => ({ email: l.email as string, stage: l.funnel_stage as string }));
    const telegramBefore = state.telegram.length;
    const r = await processQueue("cron");
    for (const msg of state.telegram.slice(telegramBefore))
      this.note(`📲 Telegram: ${msg.split("\n")[0].replace(/<[^>]+>/g, "")}`);
    for (const s of r.sent) {
      const log = this.db.tables.email_logs.find((l) => l.lead_id === s.leadId && l.touch_number === s.touch && l.status === "SENT") as unknown as EmailLog;
      this.note(`**${touchLabel(s.touch, s.variant)} sent** to ${s.email} — “${log.subject}”`);
    }
    for (const f of r.failed) this.note(`Send problem for ${f.email}: ${f.error.slice(0, 140)}`);
    for (const n of r.notes) if (/authorization|blocked|recorded/i.test(n)) this.note(`Worker note: ${n.slice(0, 160)}`);
    for (const b of before) {
      const now = this.db.tables.leads.find((l) => l.email === b.email);
      if (now && now.funnel_stage !== b.stage)
        this.note(
          `${b.email}: ${b.stage} → **${now.funnel_stage}**${now.sub_stage ? ` / ${now.sub_stage}` : ""}${now.funnel_stage === "REPLIED_TRIAGE" && now.reply_sentiment ? ` (${now.reply_sentiment})` : ""}`,
        );
    }
    return r;
  }

  /**
   * Fast-forwards like the production schedule: a cron run every 10 minutes, Monday–Friday (UTC),
   * until `done()` holds.
   */
  async runUntil(done: () => boolean, maxDays = 45): Promise<QueueReport[]> {
    const end = Date.now() + maxDays * DAY;
    const reports: QueueReport[] = [];
    while (!done()) {
      if (Date.now() > end) throw new Error(`${this.title}: condition not reached within ${maxDays} simulated days`);
      const d = new Date(Date.now() + 10 * MIN);
      d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 10) * 10, 0, 0);
      vi.setSystemTime(d);
      const day = d.getUTCDay();
      if (day === 0 || day === 6) continue;
      const r = await this.cron();
      if (r.sent.length || r.failed.length || r.repliesDetected || r.bounces || r.archived || r.resurfaced) reports.push(r);
    }
    return reports;
  }

  async runFor(days: number): Promise<QueueReport[]> {
    const until = Date.now() + days * DAY;
    return this.runUntil(() => Date.now() >= until, days + 1);
  }

  /** href of a tracked link in the last email sent to the lead (portfolio or résumé). */
  linkInLastEmail(kind: "portfolio" | "resume" = "portfolio", email = LEAD_EMAIL): string {
    const log = this.sentLogs(email).at(-1)!;
    const hrefs = [...log.body_html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    const href = hrefs.find((h) => (kind === "resume" ? decodeURIComponent(h).includes("/resume") : !decodeURIComponent(h).includes("/resume")));
    if (!href) throw new Error(`no ${kind} link in last email`);
    return href;
  }

  /** Describes how the last engagement event was treated (bot-filtered or counted) and any stage change. */
  private outcome(email: string, stageBefore: string): string {
    const last = this.events(email)
      .filter((e) => e.event_type === "EMAIL_OPEN" || e.event_type === "LINK_CLICK")
      .at(-1);
    const stage = this.lead(email).funnel_stage;
    if (last?.metadata.bot) return ` — _ignored as automated (${last.metadata.botReason})_`;
    return stage !== stageBefore ? ` — counted; ${stageBefore} → **${stage}**` : " — counted";
  }

  async click(kind: "portfolio" | "resume" = "portfolio", ua = CHROME_UA, email = LEAD_EMAIL): Promise<URL> {
    const before = this.lead(email).funnel_stage;
    const res = await clickGET(new NextRequest(this.linkInLastEmail(kind, email), { headers: { "user-agent": ua } }));
    await this.flushAfter();
    const to = new URL(res.headers.get("location")!);
    this.note(
      `Click on ${kind} link (${ua === CHROME_UA ? "Chrome" : ua.slice(0, 45)}) → lands with \`ref=${to.searchParams.get("ref")}\` · \`utm_content=${to.searchParams.get("utm_content")}\`${this.outcome(email, before)}`,
    );
    return to;
  }

  async open(ua = GMAIL_PROXY_UA, email = LEAD_EMAIL) {
    const before = this.lead(email).funnel_stage;
    const log = this.sentLogs(email).at(-1)!;
    const src = log.body_html.match(/<img src="([^"]+)"/)![1].replace(/&amp;/g, "&");
    await openGET(new NextRequest(src, { headers: { "user-agent": ua } }));
    await this.flushAfter();
    this.note(`Email opened (${ua === GMAIL_PROXY_UA ? "Gmail image proxy" : ua.slice(0, 45)})${this.outcome(email, before)}`);
  }

  async portfolioView(path: string, durationSec: number, email = LEAD_EMAIL) {
    const ref = this.lead(email).id;
    const post = (body: object) =>
      portfolioPOST(
        new NextRequest(`${APP}/api/track/portfolio`, {
          method: "POST",
          headers: { origin: PORTFOLIO_ORIGIN, "content-type": "text/plain", "user-agent": CHROME_UA },
          body: JSON.stringify(body),
        }),
      );
    await post({ ref, path, type: "view", title: "Portfolio" });
    await this.flushAfter();
    this.advance(durationSec * 1000);
    await post({ ref, path, type: "leave", durationSec });
    await this.flushAfter();
    this.note(`Portfolio beacon: viewed \`${path}\` for ${durationSec}s`);
  }

  /** Inbound mail from the lead: a reply in the outreach thread, or a fresh email. */
  reply(snippet: string, opts: { email?: string; inThread?: boolean; body?: string } = {}) {
    const email = opts.email ?? LEAD_EMAIL;
    const lead = this.lead(email);
    const msg = this.gmail.receive({ from: `"${lead.first_name} ${lead.last_name ?? ""}" <${email}>`, snippet, threadId: opts.inThread === false ? null : lead.gmail_thread_id });
    if (opts.body) msg.text = opts.body;
    this.note(`📩 ${opts.inThread === false ? "New email (not a reply)" : "Reply"} from lead: “${snippet}”`);
  }

  /** A mailer-daemon notice in the thread: a final failure (bounce) or a "still retrying" delay. */
  bounce(email = LEAD_EMAIL, kind: "failure" | "delay" = "failure") {
    const delay = kind === "delay";
    this.gmail.receive({
      from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      snippet: delay
        ? `Delivery incomplete. There was a temporary problem delivering your message to ${email}. Gmail will retry for 47 more hours.`
        : `Address not found. Your message wasn't delivered to ${email} because the address couldn't be found.`,
      threadId: this.lead(email).gmail_thread_id,
      subject: delay ? "Delivery Status Notification (Delay)" : "Delivery Status Notification (Failure)",
    });
    this.note(delay ? "📩 Delay notice (mailer-daemon, “will retry”) arrives in the thread" : "📩 Bounce notice (mailer-daemon, “address not found”) arrives in the thread");
  }

  async patch(body: Record<string, unknown>, email = LEAD_EMAIL): Promise<Lead> {
    const res = await leadsPATCH(new Request(`${APP}/api/leads`, { method: "PATCH", body: JSON.stringify({ id: this.lead(email).id, ...body }) }));
    const json = (await res.json()) as { lead?: Lead; error?: string };
    if (!json.lead) throw new Error(json.error);
    this.note(`Dashboard: ${JSON.stringify(body)} → ${json.lead.funnel_stage}${json.lead.sub_stage ? ` / ${json.lead.sub_stage}` : ""}`);
    return json.lead;
  }

  async approvals(body: Record<string, unknown>) {
    const res = await approvalsPOST(new Request(`${APP}/api/approvals`, { method: "POST", body: JSON.stringify(body) }));
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    this.note(`Approval queue: ${body.action}`);
    return json;
  }
}
