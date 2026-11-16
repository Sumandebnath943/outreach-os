import "server-only";
import { db, logEvent } from "./db";
import { detectBot } from "../signals";
import type { EventType, Lead } from "../types";
import { UUID_RE } from "../utils";

type Kind = "open" | "click" | "view";

const EVENT: Record<Kind, EventType> = { open: "EMAIL_OPEN", click: "LINK_CLICK", view: "PORTFOLIO_VIEW" };

/** Send time of the email an open/click belongs to; `pending` when the send is not recorded yet. */
async function emailContext(leadId: string, logId: string | null): Promise<{ sentAt: Date | null; pending: boolean; logId: string | null }> {
  if (!logId) return { sentAt: null, pending: false, logId: null };
  const res = await db().from("email_logs").select("lead_id, status, sent_at").eq("id", logId).maybeSingle();
  const row = res.data as { lead_id: string; status: string; sent_at: string } | null;
  if (!row || row.lead_id !== leadId) return { sentAt: null, pending: true, logId: null };
  if (row.status === "QUEUED_FOR_APPROVAL") return { sentAt: null, pending: true, logId };
  return { sentAt: new Date(row.sent_at), pending: false, logId };
}

/**
 * Records an engagement event. Email opens/clicks that look automated (security scanners,
 * prefetchers, hits within seconds of delivery) are logged with `bot: true` but do not bump
 * counters or promote the lead. Genuine engagement atomically bumps counters and applies the
 * WARM_ENGAGED promotion rule (click, portfolio visit, or 2+ opens).
 */
export async function recordEngagement(
  leadId: string,
  kind: Kind,
  opts: { logId?: string | null; page?: string | null; userAgent?: string | null; metadata?: Record<string, unknown> } = {},
): Promise<Lead | null> {
  if (!UUID_RE.test(leadId)) return null;
  let logId = opts.logId && UUID_RE.test(opts.logId) ? opts.logId : null;

  if (kind !== "view") {
    const ctx = await emailContext(leadId, logId);
    logId = ctx.logId;
    const bot = detectBot({ userAgent: opts.userAgent, sentAt: ctx.sentAt, logPending: ctx.pending });
    if (bot) {
      await logEvent(leadId, EVENT[kind], { ...opts.metadata, bot: true, botReason: bot }, logId);
      return null;
    }
  }

  const { data, error } = await db().rpc("oos_bump_engagement", {
    p_lead: leadId,
    p_opens: kind === "open" ? 1 : 0,
    p_clicks: kind === "click" ? 1 : 0,
    p_visits: kind === "view" ? 1 : 0,
    p_page: kind === "view" ? (opts.page ?? null) : null,
  });
  if (error) {
    console.error("[engagement] bump failed", error.message);
    return null;
  }
  const lead = (data as Lead[] | null)?.[0];
  if (!lead) return null;

  await logEvent(lead.id, EVENT[kind], opts.metadata ?? {}, logId);

  const promote = lead.funnel_stage === "OUTREACH_ACTIVE" && (kind === "click" || kind === "view" || lead.open_count >= 2);
  if (!promote) return lead;

  // Conditional update: concurrent hits (pixel + click + beacon) promote — and log — only once.
  const res = await db()
    .from("leads")
    .update({ funnel_stage: "WARM_ENGAGED" })
    .eq("id", lead.id)
    .eq("funnel_stage", "OUTREACH_ACTIVE")
    .select("*");
  const promoted = (res.data as Lead[] | null)?.[0];
  if (!promoted) return lead;
  await logEvent(lead.id, "STAGE_CHANGE", { from: "OUTREACH_ACTIVE", to: "WARM_ENGAGED", sub_stage: null, reason: `engagement_${kind}` });
  return promoted;
}

export async function attachDuration(leadId: string, path: string, durationSec: number) {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const res = await db()
    .from("tracking_events")
    .select("id, metadata")
    .eq("lead_id", leadId)
    .eq("event_type", "PORTFOLIO_VIEW")
    .eq("metadata->>path", path)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  const ev = (res.data as { id: string; metadata: Record<string, unknown> }[] | null)?.[0];
  if (!ev) return;
  const prev = Number(ev.metadata?.durationSec ?? 0);
  await db()
    .from("tracking_events")
    .update({ metadata: { ...ev.metadata, durationSec: Math.max(prev, durationSec) } })
    .eq("id", ev.id);
}
