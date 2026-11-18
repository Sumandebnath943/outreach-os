import "server-only";
import { randomUUID } from "node:crypto";
import type { gmail_v1 } from "@googleapis/gmail";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { countSentSince, db, getSettings, logEvent, must, updateLead } from "./db";
import { suppression } from "./lead-query";
import { checkLeadEmail, processEmailChecks } from './email-check';
import { env } from "./env";
import { checkInbound, gmailClient, isGmailAuthError, sendViaGmail, type ReplyCheck } from "./gmail";
import { analyzeReply } from "./groq";
import { appendReference, buildMime, newMessageId, replySubject } from "./mime";
import { isResendConfigured, sendViaResend } from "./resend";
import { maybeSendDigest } from "./digest";
import { isTelegramConfigured, sendTelegram } from "./telegram";
import { pixelUrl, trackedLinks } from "./tracking";
import type { ReplyInsight } from "../ai";
import { dossierUrl, formatReplyAlert, gmailUrl } from "../notify";
import {
  branchFor,
  effectiveDailyLimit,
  inboundCutoff,
  LATE_REPLY_WINDOW_DAYS,
  pickTemplate,
  resumeDueAt,
  resumeStageFor,
  SENDABLE_STAGES,
  waitFor,
} from "../funnel";
import { GEO_TZ, touchLabel } from "../meta";
import { buildUtm, findUnresolved, mergeVars, toHtml, toPlainText } from "../render";
import { addBusinessDaysInTz, addCalendarDays, isInSendWindow, nextBusinessMorning, startOfTodayIn } from "../schedule";
import { isAuthErrorMessage, isHardBounceMessage } from "../signals";
import type { BranchVariant, EmailLog, ExecutionMode, Lead, QueueReport, SequenceTemplate, SystemSettings } from "../types";

/** How long a lead stays reserved by the run that is about to send to it. */
const CLAIM_MINUTES = 15;
/** Back-off after a transient send failure, so one broken lead cannot monopolise the queue. */
const RETRY_BACKOFF_MS = 60 * 60 * 1000;
/** Leads attempted per run (one email is sent per jitter slot). */
const MAX_ATTEMPTS_PER_RUN = 3;

// ───────────────────────────── templates & drafts ─────────────────────────────

export async function loadTemplates(): Promise<SequenceTemplate[]> {
  const res = await db().from("sequence_templates").select("*");
  return must(res, "load templates") as SequenceTemplate[];
}

export interface Draft {
  touch: number;
  variant: BranchVariant;
  subject: string; // merged, link tokens intact
  body: string; // merged plain text, link tokens intact
  draftId: string | null;
  template: SequenceTemplate;
}

export async function getDraftLog(leadId: string, touch: number): Promise<EmailLog | null> {
  const res = await db()
    .from("email_logs")
    .select("*")
    .eq("lead_id", leadId)
    .eq("touch_number", touch)
    .eq("status", "QUEUED_FOR_APPROVAL")
    .order("sent_at", { ascending: false })
    .limit(1);
  return (must(res, "load draft") as EmailLog[])[0] ?? null;
}

/** Merged (but not yet link-wrapped) email for the lead's next touch — draft overrides win. */
export async function composeNextTouch(
  lead: Lead,
  templates: SequenceTemplate[],
  draftLog?: EmailLog | null,
  signature?: string | null,
): Promise<Draft> {
  const touch = lead.current_touch + 1;
  const draft = draftLog === undefined ? await getDraftLog(lead.id, touch) : draftLog;
  const variant = (draft?.branch_variant as BranchVariant) ?? branchFor(lead, touch);
  const template = pickTemplate(templates, lead.role_track, touch, variant);
  if (!template) throw new Error(`No template for ${lead.role_track} touch ${touch} (${variant})`);

  if (draft) return { touch, variant, subject: draft.subject, body: draft.body_html, draftId: draft.id, template };

  let originalSubject = lead.original_subject;
  if (!originalSubject) {
    const t1 = pickTemplate(templates, lead.role_track, 1, "STANDARD");
    originalSubject = t1 ? mergeVars(t1.subject_template, lead) : "";
  }
  return {
    touch,
    variant,
    subject: mergeVars(template.subject_template, lead, { originalSubject }),
    body: mergeVars(template.body_template, lead, { originalSubject, signature }),
    draftId: null,
    template,
  };
}

// ───────────────────────────── inbound handling ─────────────────────────────

type Reply = Extract<ReplyCheck, { kind: "REPLY" }>;

/** Out-of-office replies resume automatically at most this many times per lead (then a human decides). */
const MAX_AUTO_RESUMES = 2;

/** Telegram alert for a detected reply: AI triage, who, snippet and one-tap links to Gmail + the dossier. */
async function alertReply(lead: Lead, result: Reply, insight: ReplyInsight, late: boolean, mailbox: string | undefined, autoResumeAt: Date | null) {
  if (!isTelegramConfigured()) return;
  const last = await db()
    .from("email_logs")
    .select("touch_number, branch_variant")
    .eq("lead_id", lead.id)
    .in("status", ["SENT", "BOUNCED"])
    .order("sent_at", { ascending: false })
    .limit(1);
  const lastLog = (last.data as { touch_number: number; branch_variant: string }[] | null)?.[0];
  const linkId = result.gmailThreadId ?? result.gmailMessageId;
  await sendTelegram(
    formatReplyAlert({
      sentiment: insight.sentiment,
      late,
      company: lead.company_name,
      person: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
      jobTitle: lead.job_title,
      email: lead.email,
      snippet: result.snippet,
      afterTouch: lastLog ? touchLabel(lastLog.touch_number, lastLog.branch_variant) : null,
      roleTrack: lead.role_track,
      geo: lead.geo_region,
      gmailLink: linkId ? gmailUrl(mailbox, linkId) : null,
      dossierLink: dossierUrl(env.appBaseUrl(), lead.id),
      ai: insight.source === "ai" ? { intent: insight.intent, summary: insight.summary, suggestedReply: insight.suggestedReply } : null,
      returnDate: insight.returnDate,
      autoResume: autoResumeAt
        ? `T${lead.current_touch + 1} on ${formatInTimeZone(autoResumeAt, GEO_TZ[lead.geo_region], "EEE d MMM, HH:mm")} (${lead.geo_region === "INDIA" ? "IST" : lead.geo_region === "US" ? "ET" : "UTC"})`
        : null,
    }),
  );
}

/**
 * When an out-of-office lead's sequence should continue: the first business morning after they
 * are back (AI-extracted return date, else 5 business days after the auto-reply), and never
 * earlier than the original schedule. Null when it should not auto-resume.
 */
async function oooResumeAt(lead: Lead, insight: ReplyInsight, receivedAt: Date, settings: SystemSettings, templates: SequenceTemplate[]): Promise<Date | null> {
  if (!settings.auto_resume_ooo || insight.sentiment !== "OUT_OF_OFFICE") return null;
  if (lead.current_touch < 1 || lead.current_touch >= 4 || !SENDABLE_STAGES.includes(lead.funnel_stage)) return null;
  const prior = await db().from("tracking_events").select("metadata").eq("lead_id", lead.id).eq("event_type", "REPLY_RECEIVED");
  const resumes = ((prior.data as { metadata: Record<string, unknown> }[] | null) ?? []).filter((e) => e.metadata?.autoResumeAt).length;
  if (resumes >= MAX_AUTO_RESUMES) return null;

  const tz = GEO_TZ[lead.geo_region];
  const back = insight.returnDate ? fromZonedTime(`${insight.returnDate}T12:00:00`, tz) : addBusinessDaysInTz(receivedAt, 5, lead.geo_region, settings);
  const afterReturn = nextBusinessMorning(back, lead.geo_region, settings);
  const last = await db()
    .from("email_logs")
    .select("sent_at")
    .eq("lead_id", lead.id)
    .in("status", ["SENT", "BOUNCED"])
    .order("sent_at", { ascending: false })
    .limit(1);
  const lastAt = (last.data as { sent_at: string }[] | null)?.[0]?.sent_at;
  const onSchedule = resumeDueAt(lastAt ? new Date(lastAt) : null, waitFor(templates, lead.role_track, lead.current_touch + 1), lead.geo_region, receivedAt, settings);
  return afterReturn > onSchedule ? afterReturn : onSchedule;
}

export async function applyInbound(lead: Lead, result: ReplyCheck, mailbox?: string): Promise<"REPLY" | "BOUNCE" | null> {
  if (result.kind === "NONE") return null;
  const fresh = must(await db().from("leads").select("*").eq("id", lead.id).maybeSingle(), "recheck inbound lead") as Lead | null;
  if (!fresh || fresh.deleted_at) return null;
  if (!SENDABLE_STAGES.includes(fresh.funnel_stage) && !(fresh.funnel_stage === "CLOSED_ARCHIVE" && fresh.sub_stage === "GHOSTED")) return null;
  lead = fresh;
  await db().from("email_logs").delete().eq("lead_id", lead.id).eq("status", "QUEUED_FOR_APPROVAL");

  if (result.kind === "REPLY") {
    const settings = await getSettings();
    const receivedAt = new Date(result.at);
    const insight = await analyzeReply({
      text: result.body || result.snippet,
      from: result.from,
      receivedAt,
      timezone: env.ownerTimezone(),
      leadName: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
      company: lead.company_name,
      senderName: settings.sender_name,
      portfolioUrl: settings.portfolio_base_url,
    });
    if (insight.intent === "UNSUBSCRIBE") must(await db().from("suppressed_addresses").upsert({ email: lead.email.toLowerCase(), reason: "Unsubscribed" }, { onConflict: "email" }).select("email"), "suppress unsubscribe");
    const late = lead.funnel_stage === "CLOSED_ARCHIVE";
    const resumeAt = late ? null : await oooResumeAt(lead, insight, receivedAt, settings, await loadTemplates());
    const replyFields = {
      replied_at: result.at,
      reply_snippet: result.snippet.slice(0, 1000),
      reply_sentiment: insight.sentiment,
    } satisfies Partial<Lead>;

    if (resumeAt) {
      // Auto-reply with a known (or assumed) return: keep the lead in the sequence and continue
      // after they're back. replied_at moves the inbound cutoff past this auto-reply.
      await updateLead(
        lead,
        { ...replyFields, funnel_stage: resumeStageFor(lead), sub_stage: null, sequence_active: true, next_touch_due_at: resumeAt.toISOString(), approval_status: "PENDING" },
        "ooo_auto_resume",
      );
    } else {
      await updateLead(
        lead,
        {
          ...replyFields,
          funnel_stage: "REPLIED_TRIAGE",
          sub_stage: late ? "LATE_REPLY" : null,
          sequence_active: false,
          next_touch_due_at: null,
          approval_status: "PENDING",
        },
        late ? "late_reply_detected" : "reply_detected",
      );
    }
    await logEvent(lead.id, "REPLY_RECEIVED", {
      from: result.from,
      snippet: result.snippet.slice(0, 500),
      sentiment: insight.sentiment,
      intent: insight.intent,
      summary: insight.summary,
      urgency: insight.urgency,
      suggestedReply: insight.suggestedReply,
      returnDate: insight.returnDate,
      autoResumeAt: resumeAt?.toISOString() ?? null,
      analysedBy: insight.source,
      late,
      gmailMessageId: result.gmailMessageId,
      gmailThreadId: result.gmailThreadId,
    });
    await alertReply(lead, result, insight, late, mailbox, resumeAt);
    return "REPLY";
  }

  await updateLead(
    lead,
    {
      funnel_stage: "CLOSED_ARCHIVE",
      sub_stage: "BOUNCED",
      sequence_active: false,
      next_touch_due_at: null,
      archived_at: new Date().toISOString(),
    },
    "bounce_detected",
  );
  must(await db().from('suppressed_addresses').upsert({ email: lead.email.toLowerCase(), reason: (result.reason || result.snippet).slice(0, 2000) }, { onConflict: 'email' }).select('email'), 'suppress bounced address');
  await db().from('leads').update({ email_check_status: 'BLOCKED', email_check_reason: (result.reason || result.snippet).slice(0, 2000) }).eq('id', lead.id);
  const last = await db()
    .from("email_logs")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("status", "SENT")
    .order("sent_at", { ascending: false })
    .limit(1);
  const lastId = (last.data as { id: string }[] | null)?.[0]?.id;
  if (lastId) await db().from("email_logs").update({ status: "BOUNCED", error: (result.reason || result.snippet).slice(0, 2000) }).eq("id", lastId);
  return "BOUNCE";
}

async function firstSentAt(leadIds: string[]): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  // 100 leads × ≤4 sends stays well under the PostgREST row cap.
  for (let i = 0; i < leadIds.length; i += 100) {
    const res = await db()
      .from("email_logs")
      .select("lead_id, sent_at")
      .in("lead_id", leadIds.slice(i, i + 100))
      .in("status", ["SENT", "BOUNCED"])
      .order("sent_at", { ascending: true });
    for (const row of must(res, "load first sends") as { lead_id: string; sent_at: string }[]) {
      if (!map.has(row.lead_id)) map.set(row.lead_id, new Date(row.sent_at));
    }
  }
  return map;
}

/** Checks Gmail for a reply/bounce newer than the lead's cutoff and applies it. */
async function syncInbound(
  gmail: gmail_v1.Gmail,
  lead: Lead,
  senderEmail: string,
  firstSent?: Date,
): Promise<"REPLY" | "BOUNCE" | null> {
  const sent = firstSent ?? (await firstSentAt([lead.id])).get(lead.id);
  return applyInbound(lead, await checkInbound(gmail, lead, senderEmail, inboundCutoff(sent, lead)), senderEmail);
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>, deadline: number) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length && Date.now() < deadline) {
        const item = items[i++];
        await fn(item);
      }
    }),
  );
}

// ───────────────────────────── dispatch ─────────────────────────────

/** The provider refused the message. `kind` decides what the worker does next. */
export class SendError extends Error {
  constructor(
    message: string,
    readonly kind: "HARD_BOUNCE" | "AUTH" | "TRANSIENT",
  ) {
    super(message);
    this.name = "SendError";
  }
}

/** The email went out but could not be recorded. Never retried automatically (it would duplicate). */
export class UnrecordedSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnrecordedSendError";
  }
}

function toSendError(e: unknown): SendError {
  if (e instanceof SendError) return e;
  const msg = (e as Error)?.message ?? String(e);
  if (isGmailAuthError(e) || isAuthErrorMessage(msg)) return new SendError(msg, "AUTH");
  if (isHardBounceMessage(msg)) return new SendError(msg, "HARD_BOUNCE");
  return new SendError(msg, "TRANSIENT");
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}

export async function dispatchTouch(
  lead: Lead,
  settings: SystemSettings,
  templates: SequenceTemplate[],
  gmail: gmail_v1.Gmail | null,
): Promise<EmailLog> {
  if (lead.deleted_at || await suppression(lead.email)) throw new SendError("Lead is deleted or address is blocked", "HARD_BOUNCE");
  const current = must(await db().from("leads").select("*").eq("id", lead.id).maybeSingle(), "verify current lead") as Lead | null;
  if (!current || current.deleted_at || !current.sequence_active || current.approval_status === "PAUSED" || current.current_touch !== lead.current_touch || current.email !== lead.email) throw new Error("Lead changed before sending; dispatch cancelled");
  if (current.email_check_status !== 'PASSED' || !current.email_check_next_at || Date.parse(current.email_check_next_at) <= Date.now()) {
    const checked = await checkLeadEmail(current);
    if (checked.status !== 'PASSED') throw new Error(`Email precheck held sending: ${checked.reason}`);
  }
  if (settings.execution_mode === 'APPROVAL_GATE' && current.approval_status !== 'APPROVED') throw new Error('Approval was revoked before sending');
  const draft = await composeNextTouch(lead, templates, undefined, settings.email_signature);
  const { touch, variant, template } = draft;

  const unresolved = findUnresolved(`${draft.subject}\n${draft.body}`);
  if (unresolved.length) throw new Error(`Unresolved template variables: ${unresolved.join(", ")}`);

  const logId = draft.draftId ?? randomUUID();
  // UTM stage = where the lead sits once this email is out (T1 moves LEAD_QUEUED → OUTREACH_ACTIVE)
  const stageAfterSend = lead.funnel_stage === "LEAD_QUEUED" ? "OUTREACH_ACTIVE" : lead.funnel_stage;
  const links = trackedLinks(lead.id, logId, settings, buildUtm(lead, stageAfterSend, touchLabel(touch, variant)));
  const text = toPlainText(draft.body, links);
  const html = toHtml(draft.body, links, pixelUrl(lead.id, logId));

  const sameThread = touch > 1 && template.same_thread && Boolean(lead.last_message_id_header);
  const subject = sameThread ? replySubject(lead.original_subject || draft.subject.replace(/^re:\s*/i, "")) : draft.subject;
  const inReplyTo = sameThread ? lead.last_message_id_header : null;
  const references = sameThread ? lead.references_header || lead.last_message_id_header : null;
  const toName = [lead.first_name !== "Team" ? lead.first_name : "", lead.last_name ?? ""].join(" ").trim() || undefined;

  // ── 1. hand the message to the provider ──
  let providerMessageId: string;
  let rfcMessageId: string;
  let threadId: string | null = lead.gmail_thread_id;
  try {
    if (settings.send_provider === "RESEND") {
      if (!isResendConfigured()) throw new SendError("RESEND_API_KEY is not configured", "AUTH");
      const fromDomainEmail = (env.resendFrom().match(/<([^>]+)>/)?.[1] ?? env.resendFrom()) || settings.sender_email;
      rfcMessageId = newMessageId(fromDomainEmail);
      const r = await sendViaResend(settings, { to: lead.email, toName, subject, html, text, messageId: rfcMessageId, inReplyTo, references });
      providerMessageId = r.id;
    } else {
      if (!gmail) throw new SendError("Gmail is not connected (set GOOGLE_CLIENT_ID/SECRET and a refresh token)", "AUTH");
      const { raw, messageId } = buildMime({
        fromName: settings.sender_name,
        fromEmail: settings.sender_email,
        to: lead.email,
        toName,
        subject,
        text,
        html,
        inReplyTo,
        references,
      });
      const sent = await sendViaGmail(gmail, raw, sameThread ? lead.gmail_thread_id : null);
      providerMessageId = sent.id;
      rfcMessageId = sent.messageIdHeader ?? messageId;
      threadId = sent.threadId;
    }
  } catch (e) {
    throw toSendError(e);
  }

  // ── 2. record it (the email is out — from here on, failures must never cause a resend) ──
  const now = new Date();
  const nextDue =
    touch < 4
      ? addBusinessDaysInTz(now, waitFor(templates, lead.role_track, touch + 1), lead.geo_region, settings)
      : addBusinessDaysInTz(now, settings.archive_after_business_days ?? 4, lead.geo_region, settings);
  const leadPatch: Partial<Lead> = {
    current_touch: touch,
    original_subject: touch === 1 || !lead.original_subject ? subject : lead.original_subject,
    gmail_thread_id: settings.send_provider === "GMAIL" ? threadId : lead.gmail_thread_id,
    last_message_id_header: rfcMessageId,
    references_header: appendReference(sameThread ? references : null, rfcMessageId),
    next_touch_due_at: nextDue.toISOString(),
    approval_status: "PENDING",
  };
  // only move the stage forward; never write back a possibly stale stage
  if (lead.funnel_stage === "LEAD_QUEUED") leadPatch.funnel_stage = "OUTREACH_ACTIVE";

  try {
    return await withRetry(async () => {
      const logRes = await db()
        .from("email_logs")
        .upsert({
          id: logId,
          lead_id: lead.id,
          is_test: lead.is_test ?? false,
          touch_number: touch,
          branch_variant: variant,
          subject,
          body_html: html,
          provider: settings.send_provider,
          provider_message_id: providerMessageId,
          rfc_message_id: rfcMessageId,
          gmail_thread_id: settings.send_provider === "GMAIL" ? threadId : null,
          status: "SENT",
          sent_at: now.toISOString(),
          error: null,
        })
        .select("*")
        .single();
      const log = must(logRes, "write email log") as EmailLog;
      await updateLead(lead, leadPatch, "touch_sent");
      return log;
    });
  } catch (e) {
    const reason = (e as Error)?.message ?? String(e);
    // Best effort: park the lead so neither mode re-sends this touch.
    try {
      await db().from("leads").update({ approval_status: "PAUSED", next_touch_due_at: null }).eq("id", lead.id);
    } catch {
      /* database unreachable — the error below tells the operator what happened */
    }
    throw new UnrecordedSendError(
      `T${touch} was sent to ${lead.email} (${providerMessageId}) but could not be recorded: ${reason}. The lead was paused to prevent a duplicate — fix the database, then resume it.`,
    );
  }
}

/**
 * Atomically reserves a due lead for this run. Returns the fresh row, or null when another run
 * already took it or its state changed (replied, paused, touch advanced) since it was listed.
 */
async function claimLead(lead: Lead, mode: ExecutionMode): Promise<Lead | null> {
  const nowIso = new Date().toISOString();
  let q = db()
    .from("leads")
    .update({ next_touch_due_at: new Date(Date.now() + CLAIM_MINUTES * 60_000).toISOString() })
    .eq("id", lead.id)
    .eq("sequence_active", true)
    .is("deleted_at", null)
    .eq("current_touch", lead.current_touch)
    .in("funnel_stage", SENDABLE_STAGES)
    .lte("next_touch_due_at", nowIso);
  q = mode === "APPROVAL_GATE" ? q.eq("approval_status", "APPROVED") : q.neq("approval_status", "PAUSED");
  const res = await q.select("*");
  return (must(res, "claim lead") as Lead[])[0] ?? null;
}

// ───────────────────────────── master worker ─────────────────────────────

export async function processQueue(trigger: string, budgetMs = 50_000): Promise<QueueReport> {
  const started = Date.now();
  const deadline = started + budgetMs;
  const settings = await getSettings();
  const gmail = gmailClient(settings);
  const now = new Date();
  const dailyCap = effectiveDailyLimit(settings, now, env.ownerTimezone());
  const report: QueueReport = {
    ranAt: now.toISOString(),
    trigger,
    mode: settings.execution_mode,
    provider: settings.send_provider,
    gmailConnected: Boolean(gmail),
    resurfaced: 0,
    repliesChecked: 0,
    repliesDetected: 0,
    bounces: 0,
    archived: 0,
    dueCandidates: 0,
    inWindow: 0,
    sent: [],
    failed: [],
    quota: { sent: 0, limit: dailyCap.cap },
    nextDispatchAt: settings.next_dispatch_at,
    notes: [],
  };

  const checkedEmails = await processEmailChecks();
  if (checkedEmails) report.notes.push(`Email prechecks completed: ${checkedEmails}. Only passed addresses can send.`);

  // 0 ─ Morning digest (once per day, after DIGEST_TIME in the owner's timezone).
  try {
    if (await maybeSendDigest(settings)) report.notes.push("Daily digest sent to Telegram.");
  } catch (e) {
    console.error("[queue] digest failed", e);
  }

  // 1 ─ Resurface nurture leads whose re-engage date has arrived.
  const nurture = await db()
    .from("leads")
    .select("*").is("deleted_at", null)
    .eq("funnel_stage", "NURTURE_LATER")
    .lte("reengage_at", now.toISOString());
  for (const lead of (nurture.data as Lead[] | null) ?? []) {
    try {
      await updateLead(lead, { funnel_stage: "REPLIED_TRIAGE", sub_stage: "REENGAGE_DUE", reengage_at: null }, "reengage_due");
      report.resurfaced++;
    } catch (e) {
      console.error("[queue] resurface failed", lead.email, e);
    }
  }

  // 2 ─ Reply kill-switch: poll Gmail for every lead with an active sequence, plus recently
  //     ghosted leads (a late reply moves them back to triage).
  let gmailAuthFailed = false;
  if (gmail) {
    const [active, ghosted] = await Promise.all([
      db()
        .from("leads")
        .select("*").is("deleted_at", null)
        .eq("sequence_active", true)
        .gte("current_touch", 1)
        .in("funnel_stage", SENDABLE_STAGES)
        .order("last_reply_checked_at", { ascending: true, nullsFirst: true }).order("id").limit(300),
      db()
        .from("leads")
        .select("*").is("deleted_at", null)
        .eq("funnel_stage", "CLOSED_ARCHIVE")
        .eq("sub_stage", "GHOSTED")
        .gte("archived_at", addCalendarDays(now, -LATE_REPLY_WINDOW_DAYS).toISOString())
        .order("last_reply_checked_at", { ascending: true, nullsFirst: true }).order("id").limit(300),
    ]);
    const leads = [...(must(active, "load active leads") as Lead[]), ...(must(ghosted, "load ghosted leads") as Lead[])].sort((a, b) =>
      (a.last_reply_checked_at ? Date.parse(a.last_reply_checked_at) : 0) - (b.last_reply_checked_at ? Date.parse(b.last_reply_checked_at) : 0) || a.id.localeCompare(b.id));
    const firstSent = await firstSentAt(leads.map((l) => l.id));
    await pool(
      leads,
      6,
      async (lead) => {
        if (gmailAuthFailed) return;
        try {
          const outcome = await syncInbound(gmail, lead, settings.sender_email, firstSent.get(lead.id));
          report.repliesChecked++;
          await db().from("leads").update({ last_reply_checked_at: new Date().toISOString() }).eq("id", lead.id);
          if (outcome === "REPLY") report.repliesDetected++;
          if (outcome === "BOUNCE") report.bounces++;
        } catch (e) {
          if (isGmailAuthError(e)) gmailAuthFailed = true;
          else { console.error("[queue] reply check failed", lead.email, e); await db().from("leads").update({ last_reply_checked_at: new Date().toISOString() }).eq("id", lead.id); }
        }
      },
      started + budgetMs * 0.6,
    );
    if (gmailAuthFailed) {
      report.notes.push("Gmail authorization failed (token revoked or expired) — reconnect Gmail in Settings. Sending is paused until then.");
      report.gmailConnected = false;
    } else if (report.repliesChecked < leads.length) {
      report.notes.push(`Reply sync checked ${report.repliesChecked}/${leads.length} leads before time budget.`);
    }
  } else {
    report.notes.push("Gmail not connected — reply detection skipped.");
  }

  // 3 ─ Auto-archive ghosted leads (Touch 4 sent, archive window elapsed).
  const ghosts = await db()
    .from("leads")
    .select("*").is("deleted_at", null)
    .eq("sequence_active", true)
    .gte("current_touch", 4)
    .in("funnel_stage", SENDABLE_STAGES)
    .lte("next_touch_due_at", now.toISOString());
  for (const lead of (ghosts.data as Lead[] | null) ?? []) {
    try {
      await updateLead(
        lead,
        {
          funnel_stage: "CLOSED_ARCHIVE",
          sub_stage: "GHOSTED",
          sequence_active: false,
          next_touch_due_at: null,
          archived_at: new Date().toISOString(),
        },
        "sequence_complete",
      );
      report.archived++;
    } catch (e) {
      console.error("[queue] archive failed", lead.email, e);
    }
  }

  // 4 ─ Daily quota.
  report.quota.sent = await countSentSince(startOfTodayIn(env.ownerTimezone()).toISOString());
  await db().from("system_settings").update({ last_queue_run_at: new Date().toISOString() }).eq("id", 1);

  // Never send while follow-ups cannot be verified against the inbox.
  if (gmailAuthFailed) return report;
  if (report.quota.sent >= dailyCap.cap) {
    report.notes.push(dailyCap.warmupWeek ? `Warm-up week ${dailyCap.warmupWeek} cap (${dailyCap.cap}/day) reached.` : "Daily send limit reached.");
    return report;
  }

  // 5 ─ Due touches inside the recipient's business-hours window.
  const openRegions = (["INDIA", "US", "GLOBAL"] as const).filter(g => isInSendWindow(g, settings));
  if (!openRegions.length) return report;
  let q = db()
    .from("leads")
    .select("*").is("deleted_at", null)
    .in("geo_region", [...openRegions])
    .eq("sequence_active", true)
    .lt("current_touch", 4)
    .eq('email_check_status', 'PASSED')
    .in("funnel_stage", SENDABLE_STAGES)
    .lte("next_touch_due_at", new Date().toISOString())
    .order("next_touch_due_at", { ascending: true }).order("id")
    .limit(300);
  q = settings.execution_mode === "APPROVAL_GATE" ? q.eq("approval_status", "APPROVED") : q.neq("approval_status", "PAUSED");
  const due = must(await q, "load due leads") as Lead[];
  report.dueCandidates = due.length;
  const inWindow = due.filter((l) => isInSendWindow(l.geo_region, settings));
  report.inWindow = inWindow.length;
  if (!inWindow.length) {
    if (due.length) report.notes.push("Due touches exist but all recipients are outside their send window.");
    return report;
  }
  if (Date.now() > deadline) {
    report.notes.push("Time budget exhausted before dispatch.");
    return report;
  }

  // 6 ─ Jitter gate: atomically claim the next dispatch slot (one email per slot).
  const claim = await db().rpc("oos_claim_dispatch_slot", {
    p_min: settings.min_delay_minutes,
    p_max: Math.max(settings.max_delay_minutes, settings.min_delay_minutes),
  });
  if (claim.error) throw new Error(`claim dispatch slot: ${claim.error.message}`);
  const slot = (claim.data as { next_dispatch_at: string }[] | null)?.[0];
  if (!slot) {
    report.notes.push("Waiting on human-jitter delay before the next send.");
    return report;
  }
  report.nextDispatchAt = slot.next_dispatch_at;

  // 7 ─ Reserve a lead, verify its thread, send.
  const templates = await loadTemplates();
  let attempts = 0;
  let slotUsed = false;
  for (const candidate of inWindow) {
    if (attempts >= MAX_ATTEMPTS_PER_RUN || Date.now() > deadline) break;
    const lead = await claimLead(candidate, settings.execution_mode);
    if (!lead) continue; // another run took it, or it changed since it was listed

    // Pre-send thread verification for follow-ups: never send one we could not verify.
    if (gmail && lead.current_touch >= 1) {
      try {
        const outcome = await syncInbound(gmail, lead, settings.sender_email);
        if (outcome === "REPLY") report.repliesDetected++;
        if (outcome === "BOUNCE") report.bounces++;
        if (outcome) continue;
      } catch (e) {
        if (isGmailAuthError(e)) {
          report.notes.push("Gmail authorization failed — reconnect Gmail in Settings.");
          break;
        }
        report.failed.push({ leadId: lead.id, email: lead.email, error: `pre-send verification: ${(e as Error).message}` });
        continue; // stays reserved for CLAIM_MINUTES, then retried
      }
    }

    attempts++;
    try {
      const log = await dispatchTouch(lead, settings, templates, gmail);
      report.sent.push({ leadId: lead.id, email: lead.email, touch: log.touch_number, variant: log.branch_variant });
      slotUsed = true;
      break; // one email per jitter slot
    } catch (e) {
      const message = (e as Error).message ?? String(e);
      report.failed.push({ leadId: lead.id, email: lead.email, error: message });

      if (e instanceof UnrecordedSendError) {
        slotUsed = true; // an email did go out
        break;
      }
      if (e instanceof SendError && e.kind === "AUTH") {
        report.notes.push(`Sending is blocked: ${message}`);
        break; // every other lead would fail the same way
      }

      await db().from("email_logs").insert({
        lead_id: lead.id,
        touch_number: lead.current_touch + 1,
        subject: "(send failed)",
        body_html: "",
        provider: settings.send_provider,
        status: "FAILED",
        error: message.slice(0, 2000),
      });
      if (e instanceof SendError && e.kind === "HARD_BOUNCE") {
        must(await db().from('suppressed_addresses').upsert({ email: lead.email.toLowerCase(), reason: message.slice(0, 2000) }, { onConflict: 'email' }).select('email'), 'suppress rejected address');
        await db().from('leads').update({ email_check_status: 'BLOCKED', email_check_reason: message.slice(0, 2000) }).eq('id', lead.id);
        await updateLead(
          lead,
          {
            funnel_stage: "CLOSED_ARCHIVE",
            sub_stage: "BOUNCED",
            sequence_active: false,
            next_touch_due_at: null,
            archived_at: new Date().toISOString(),
          },
          "hard_bounce",
        );
        report.bounces++;
      } else {
        await db()
          .from("leads")
          .update({ next_touch_due_at: new Date(Date.now() + RETRY_BACKOFF_MS).toISOString() })
          .eq("id", lead.id);
      }
    }
  }

  if (!slotUsed) {
    // nothing went out — release the slot so the next run isn't delayed
    await db().from("system_settings").update({ next_dispatch_at: null }).eq("id", 1);
    report.nextDispatchAt = null;
  }
  return report;
}
