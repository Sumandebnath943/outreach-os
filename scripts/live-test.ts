/**
 * Live pipeline rounds against the real database and Gmail, with time fast-forwarded by
 * moving each test lead's due date into the past. Sends REAL emails — only to plus-address
 * variants of LIVE_LEAD_EMAIL (e.g. you+r1@gmail.com, delivered to your own inbox).
 *
 *   npm run live -- status
 *   npm run live -- next <tag>        send the tag's next touch now (creates the lead on first use)
 *   npm run live -- sync              run the worker once: reply / bounce detection, ghost archiving
 *   npm run live -- resume <tag>      dashboard "Resume" (after an out-of-office reply)
 *   npm run live -- archive <tag>     fast-forward past the post-T4 wait so the worker archives it
 *   npm run live -- cleanup           delete every test lead (and its logs/events)
 *
 * Reads .env / .env.local (LIVE_LEAD_EMAIL plus the usual Supabase / Google / tracking variables).
 * Safety: refuses to run while any non-test lead could be sent, and never changes settings.
 */
import { PATCH as leadsPATCH } from "../src/app/api/leads/route";
import { db, getSettings, must } from "../src/lib/server/db";
import { processQueue } from "../src/lib/server/sequencer";
import { normalizeLead } from "../src/lib/ingest";
import { touchLabel } from "../src/lib/meta";
import { isInSendWindow } from "../src/lib/schedule";
import { SENDABLE_STAGES } from "../src/lib/funnel";
import type { EmailLog, GeoRegion, Lead, TrackingEvent } from "../src/lib/types";

const BASE = (process.env.LIVE_LEAD_EMAIL ?? "").trim().toLowerCase();
if (!/^[^@\s+]+@[^@\s]+\.[a-z]{2,}$/i.test(BASE)) {
  console.error("Set LIVE_LEAD_EMAIL in .env.local to the inbox that receives the test emails (no +tag).");
  process.exit(1);
}
const [user, domain] = BASE.split("@");
const emailFor = (tag: string) => `${user}+${tag}@${domain}`;
const isTestEmail = (e: string) => e.startsWith(`${user}+`) && e.endsWith(`@${domain}`);

const ROUND_NAMES: Record<string, string> = {
  nr: "No reply (full sequence → archive)",
  rp: "Reply after T1",
  wm: "Warm: click → T2A",
  oo: "Out-of-office → resume",
};

async function testLeads(): Promise<Lead[]> {
  const res = await db().from("leads").select("*").like("email", `${user}+%@${domain}`).order("created_at");
  return (must(res, "load test leads") as Lead[]).filter((l) => isTestEmail(l.email));
}

/** Aborts when a real lead could go out during this run. */
async function assertIsolated() {
  const res = await db()
    .from("leads")
    .select("email")
    .eq("sequence_active", true)
    .in("funnel_stage", SENDABLE_STAGES)
    .lte("next_touch_due_at", new Date(Date.now() + 15 * 60_000).toISOString())
    .neq("approval_status", "PAUSED");
  const real = (must(res, "isolation check") as { email: string }[]).filter((r) => !isTestEmail(r.email));
  if (real.length) {
    console.error(`Refusing to run: ${real.length} real lead(s) are due within 15 minutes and could be sent by this run.`);
    process.exit(1);
  }
}

function openGeo(): GeoRegion | null {
  const s = { india_window_start: 10, india_window_end: 18, us_window_start: 9, us_window_end: 17, global_window_start: 9, global_window_end: 18 };
  return (["INDIA", "US", "GLOBAL"] as GeoRegion[]).find((g) => isInSendWindow(g, s)) ?? null;
}

async function ensureLead(tag: string): Promise<Lead> {
  const email = emailFor(tag);
  const found = await db().from("leads").select("*").eq("email", email).maybeSingle();
  if (found.data) return found.data as Lead;
  const geo = openGeo();
  if (!geo) {
    console.error("No send window is open right now (IN 10–18 IST, US 9–17 ET, GLOBAL 9–18 UTC, Mon–Fri). Try again inside one.");
    process.exit(1);
  }
  const n = normalizeLead({
    email,
    first_name: "Suman",
    last_name: `Test ${tag.toUpperCase()}`,
    company_name: `OutreachOS Live Test ${tag.toUpperCase()}`,
    target_role_opening: "AI Product Marketing Manager",
    custom_icebreaker: `This is live test round “${ROUND_NAMES[tag] ?? tag}”.`,
    geo_region: geo,
  });
  if (!n.ok) throw new Error(n.error);
  const res = await db()
    .from("leads")
    .insert({ ...n.lead, is_test: true, next_touch_due_at: new Date().toISOString(), notes: "OutreachOS live test lead — safe to delete" })
    .select("*")
    .single();
  const lead = must(res, "create test lead") as Lead;
  await db().from("tracking_events").insert({ lead_id: lead.id, event_type: "STAGE_CHANGE", metadata: { from: null, to: "LEAD_QUEUED", reason: "live_test" } });
  console.log(`Created ${email} (${geo})`);
  return lead;
}

/** Fast-forward: make the tag's next step due now, approve it, open the jitter slot, run the worker once. */
async function runFor(lead: Lead | null, label: string) {
  await assertIsolated();
  if (lead) {
    await db()
      .from("leads")
      .update({ next_touch_due_at: new Date(Date.now() - 60_000).toISOString(), approval_status: "APPROVED" })
      .eq("id", lead.id);
  }
  await db().from("system_settings").update({ next_dispatch_at: null }).eq("id", 1);
  const r = await processQueue(`live-test:${label}`);
  for (const s of r.sent) console.log(`  SENT ${touchLabel(s.touch, s.variant)} → ${s.email}`);
  for (const f of r.failed) console.log(`  FAILED ${f.email}: ${f.error}`);
  if (r.repliesDetected) console.log(`  replies detected: ${r.repliesDetected}`);
  if (r.bounces) console.log(`  bounces: ${r.bounces}`);
  if (r.archived) console.log(`  archived: ${r.archived}`);
  for (const n of r.notes) console.log(`  note: ${n}`);
  return r;
}

async function status() {
  const leads = await testLeads();
  if (!leads.length) return console.log("No test leads yet.");
  const ids = leads.map((l) => l.id);
  const [logs, events] = await Promise.all([
    db().from("email_logs").select("*").in("lead_id", ids).order("sent_at"),
    db().from("tracking_events").select("*").in("lead_id", ids).order("created_at"),
  ]);
  for (const l of leads) {
    const ls = (logs.data as EmailLog[]).filter((x) => x.lead_id === l.id);
    const ev = (events.data as TrackingEvent[]).filter((x) => x.lead_id === l.id && x.event_type !== "STAGE_CHANGE");
    console.log(`\n${l.email}  [${l.funnel_stage}${l.sub_stage ? ` / ${l.sub_stage}` : ""}]  touch ${l.current_touch}/4  active=${l.sequence_active}  approval=${l.approval_status}`);
    console.log(`  opens ${l.open_count} · clicks ${l.click_count} · pages ${(l.portfolio_pages_viewed ?? []).join(", ") || "—"}`);
    if (l.reply_snippet) console.log(`  reply (${l.reply_sentiment}): “${l.reply_snippet.slice(0, 120)}”`);
    if (l.next_touch_due_at) console.log(`  next due ${l.next_touch_due_at}`);
    for (const x of ls) console.log(`  ${x.status.padEnd(8)} ${touchLabel(x.touch_number, x.branch_variant).padEnd(4)} ${x.sent_at}  “${x.subject}”`);
    for (const e of ev) {
      const m = e.metadata as Record<string, unknown>;
      const extra = m.bot ? ` (ignored: ${m.botReason})` : m.utm_content ? ` utm_content=${m.utm_content}` : m.path ? ` ${m.path}` : m.sentiment ? ` ${m.sentiment}` : "";
      console.log(`  event ${e.event_type}${extra}  ${e.created_at}`);
    }
  }
}

async function main() {
  const [cmd, tag] = process.argv.slice(2);
  const settings = await getSettings();
  console.log(`OutreachOS live test · provider ${settings.send_provider} · mode ${settings.execution_mode} (unchanged) · inbox ${BASE}`);

  switch (cmd) {
    case "status":
      return status();
    case "next": {
      if (!tag) throw new Error("usage: next <tag>");
      const lead = await ensureLead(tag);
      if (!lead.sequence_active) return console.log(`${lead.email} has no active sequence (${lead.funnel_stage}).`);
      await runFor(lead, `next:${tag}`);
      return status();
    }
    case "sync":
      await runFor(null, "sync");
      return status();
    case "resume": {
      const lead = (await testLeads()).find((l) => l.email === emailFor(tag));
      if (!lead) throw new Error(`no test lead ${tag}`);
      // the same handler the dashboard's Resume button calls
      const res = await leadsPATCH(new Request("http://live-test/api/leads", { method: "PATCH", body: JSON.stringify({ id: lead.id, action: "resume_sequence" }) }));
      const json = (await res.json()) as { lead?: Lead; error?: string };
      if (!json.lead) throw new Error(json.error);
      console.log(`Resumed ${lead.email} → ${json.lead.funnel_stage}, next touch due ${json.lead.next_touch_due_at} (original schedule)`);
      return status();
    }
    case "archive": {
      const lead = (await testLeads()).find((l) => l.email === emailFor(tag));
      if (!lead || lead.current_touch < 4) throw new Error("archive needs a test lead that has received T4");
      await runFor(lead, `archive:${tag}`);
      return status();
    }
    case "cleanup": {
      const leads = await testLeads();
      if (!leads.length) return console.log("Nothing to clean up.");
      must(await db().from("leads").delete().in("id", leads.map((l) => l.id)).select("id"), "delete test leads");
      return console.log(`Deleted ${leads.length} test lead(s): ${leads.map((l) => l.email).join(", ")}`);
    }
    default:
      console.log("commands: status | next <tag> | sync | resume <tag> | archive <tag> | cleanup");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
