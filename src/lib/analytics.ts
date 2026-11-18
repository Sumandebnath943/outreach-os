/**
 * Outreach analytics — pure aggregation over leads, email logs and tracking events so the
 * API, the simulation and unit tests all compute identical numbers.
 *
 * Definitions (all exclude bot/prefetch hits, which are logged with metadata.bot = true):
 *  - sent        emails that left (SENT + BOUNCED) in the range; delivered = sent − bounced
 *  - open rate   delivered emails with ≥1 genuine open ÷ delivered
 *  - click rate  delivered emails with ≥1 genuine click ÷ delivered
 *  - contacted   distinct leads emailed in the range (the cohort for lead-level rates)
 *  - reply rate  contacted leads that sent a human reply (out-of-office excluded) ÷ contacted
 *  - positive    contacted leads with a reply classified POSITIVE ÷ contacted
 *  - funnel      furthest stage each contacted lead ever reached (stage history + current stage)
 */
import { formatInTimeZone } from "date-fns-tz";
import { touchLabel } from "./meta";
import type { FunnelStage, GeoRegion, RoleTrack } from "./types";

export interface AnalyticsLead {
  id: string;
  funnel_stage: FunnelStage;
  sub_stage: string | null;
  role_track: RoleTrack;
  geo_region: GeoRegion;
}
export interface AnalyticsLog {
  id: string;
  lead_id: string;
  touch_number: number;
  branch_variant: string;
  status: string;
  sent_at: string;
}
export interface AnalyticsEvent {
  lead_id: string;
  email_log_id: string | null;
  event_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Rate {
  n: number;
  d: number;
  rate: number | null;
}
export interface SegmentRow {
  key: string;
  contacted: number;
  sent: number;
  open: Rate;
  click: Rate;
  reply: Rate;
  bounce: Rate;
}
export interface TouchRow {
  key: string;
  sent: number;
  open: Rate;
  click: Rate;
  bounce: Rate;
  replies: number;
}
export interface Analytics {
  range: { from: string | null; to: string; days: number | null };
  totals: {
    sent: number;
    delivered: number;
    bounced: number;
    contacted: number;
    open: Rate;
    click: Rate;
    reply: Rate;
    positive: Rate;
    bounce: Rate;
    portfolio: Rate;
    botHitsFiltered: number;
  };
  funnel: { stage: string; label: string; leads: number; pctOfContacted: number | null }[];
  byTouch: TouchRow[];
  byTrack: SegmentRow[];
  byGeo: SegmentRow[];
  daily: { day: string; sent: number; replies: number }[];
}

const rate = (n: number, d: number): Rate => ({ n, d, rate: d ? n / d : null });
const isBot = (e: AnalyticsEvent) => Boolean(e.metadata?.bot);
const sentimentOf = (e: AnalyticsEvent) => String(e.metadata?.sentiment ?? "");

const FUNNEL: { stage: string; label: string; reached: Set<string> }[] = [
  { stage: "CONTACTED", label: "Contacted", reached: new Set() },
  { stage: "WARM_ENGAGED", label: "Engaged (warm)", reached: new Set(["WARM_ENGAGED"]) },
  { stage: "REPLIED", label: "Replied (human)", reached: new Set() },
  { stage: "INTERVIEWING", label: "Interviewing", reached: new Set(["INTERVIEWING", "OFFER_STAGE"]) },
  { stage: "OFFER_STAGE", label: "Offer", reached: new Set(["OFFER_STAGE"]) },
];

const TOUCH_ORDER = ["T1", "T2A", "T2B", "T3", "T4"];

export function computeAnalytics(
  input: { leads: AnalyticsLead[]; logs: AnalyticsLog[]; events: AnalyticsEvent[] },
  opts: { from: Date | null; to?: Date; tz?: string } = { from: null },
): Analytics {
  const to = opts.to ?? new Date();
  const tz = opts.tz ?? "Asia/Kolkata";
  const inRange = (iso: string) => (!opts.from || iso >= opts.from.toISOString()) && iso <= to.toISOString();

  const logs = input.logs.filter((l) => (l.status === "SENT" || l.status === "BOUNCED") && inRange(l.sent_at));
  const logIds = new Set(logs.map((l) => l.id));
  const contactedIds = new Set(logs.map((l) => l.lead_id));
  const leads = input.leads.filter((l) => contactedIds.has(l.id));
  const events = input.events.filter((e) => contactedIds.has(e.lead_id));

  const genuine = events.filter((e) => !isBot(e));
  const openedLogs = new Set(genuine.filter((e) => e.event_type === "EMAIL_OPEN" && e.email_log_id && logIds.has(e.email_log_id)).map((e) => e.email_log_id!));
  const clickedLogs = new Set(genuine.filter((e) => e.event_type === "LINK_CLICK" && e.email_log_id && logIds.has(e.email_log_id)).map((e) => e.email_log_id!));
  const replies = events.filter((e) => e.event_type === "REPLY_RECEIVED" && sentimentOf(e) !== "OUT_OF_OFFICE");
  const repliedLeads = new Set(replies.map((e) => e.lead_id));
  const positiveLeads = new Set(replies.filter((e) => sentimentOf(e) === "POSITIVE").map((e) => e.lead_id));
  const visitedLeads = new Set(events.filter((e) => e.event_type === "PORTFOLIO_VIEW").map((e) => e.lead_id));
  const openedLeads = new Set(genuine.filter((e) => e.event_type === "EMAIL_OPEN").map((e) => e.lead_id));
  const clickedLeads = new Set(genuine.filter((e) => e.event_type === "LINK_CLICK").map((e) => e.lead_id));

  // stage history: every stage a lead has been in
  const reached = new Map<string, Set<string>>();
  for (const l of leads) reached.set(l.id, new Set([l.funnel_stage]));
  for (const e of events) if (e.event_type === "STAGE_CHANGE" && e.metadata?.to) reached.get(e.lead_id)?.add(String(e.metadata.to));

  const bounced = logs.filter((l) => l.status === "BOUNCED").length;
  const delivered = logs.length - bounced;

  const funnel = FUNNEL.map((f) => {
    let n: number;
    if (f.stage === "CONTACTED") n = leads.length;
    else if (f.stage === "REPLIED") n = repliedLeads.size;
    else if (f.stage === "WARM_ENGAGED")
      // anyone who replied, interviewed or got an offer was engaged too
      n = leads.filter((l) => [...reached.get(l.id)!].some((s) => ["WARM_ENGAGED", "INTERVIEWING", "OFFER_STAGE"].includes(s)) || repliedLeads.has(l.id)).length;
    else n = leads.filter((l) => [...reached.get(l.id)!].some((s) => f.reached.has(s)) || (f.stage === "OFFER_STAGE" && l.sub_stage === "HIRED")).length;
    return { stage: f.stage, label: f.label, leads: n, pctOfContacted: leads.length ? n / leads.length : null };
  });

  // ── per touch slot ──
  const slotOf = (l: AnalyticsLog) => touchLabel(l.touch_number, l.branch_variant);
  const logsByLead = new Map<string, AnalyticsLog[]>();
  for (const l of logs) logsByLead.set(l.lead_id, [...(logsByLead.get(l.lead_id) ?? []), l]);
  /** A reply is credited to the last email the lead received before replying. */
  const replySlot = new Map<string, number>();
  for (const r of replies) {
    const prior = (logsByLead.get(r.lead_id) ?? []).filter((l) => l.sent_at <= r.created_at).sort((a, b) => a.sent_at.localeCompare(b.sent_at)).at(-1);
    if (prior) replySlot.set(slotOf(prior), (replySlot.get(slotOf(prior)) ?? 0) + 1);
  }
  const byTouch: TouchRow[] = TOUCH_ORDER.map((key) => {
    const ls = logs.filter((l) => slotOf(l) === key);
    const b = ls.filter((l) => l.status === "BOUNCED").length;
    const dlv = ls.length - b;
    return {
      key,
      sent: ls.length,
      open: rate(ls.filter((l) => openedLogs.has(l.id)).length, dlv),
      click: rate(ls.filter((l) => clickedLogs.has(l.id)).length, dlv),
      bounce: rate(b, ls.length),
      replies: replySlot.get(key) ?? 0,
    };
  }).filter((r) => r.sent > 0);

  // ── per segment (lead-level rates) ──
  const segment = (keyOf: (l: AnalyticsLead) => string): SegmentRow[] => {
    const groups = new Map<string, AnalyticsLead[]>();
    for (const l of leads) groups.set(keyOf(l), [...(groups.get(keyOf(l)) ?? []), l]);
    return [...groups.entries()]
      .map(([key, ls]) => {
        const ids = new Set(ls.map((l) => l.id));
        const segLogs = logs.filter((l) => ids.has(l.lead_id));
        return {
          key,
          contacted: ls.length,
          sent: segLogs.length,
          open: rate(ls.filter((l) => openedLeads.has(l.id)).length, ls.length),
          click: rate(ls.filter((l) => clickedLeads.has(l.id)).length, ls.length),
          reply: rate(ls.filter((l) => repliedLeads.has(l.id)).length, ls.length),
          bounce: rate(segLogs.filter((l) => l.status === "BOUNCED").length, segLogs.length),
        };
      })
      .sort((a, b) => b.contacted - a.contacted || a.key.localeCompare(b.key));
  };

  // ── daily series (owner timezone) ──
  const dayKey = (iso: string) => formatInTimeZone(new Date(iso), tz, "yyyy-MM-dd");
  const first = opts.from ?? (logs.length ? new Date(logs.map((l) => l.sent_at).sort()[0]) : to);
  const daily: Analytics["daily"] = [];
  const sentByDay = new Map<string, number>();
  const repliesByDay = new Map<string, number>();
  for (const l of logs) sentByDay.set(dayKey(l.sent_at), (sentByDay.get(dayKey(l.sent_at)) ?? 0) + 1);
  for (const r of replies) if (inRange(r.created_at)) repliesByDay.set(dayKey(r.created_at), (repliesByDay.get(dayKey(r.created_at)) ?? 0) + 1);
  for (let t = first.getTime(), guard = 0; dayKey(new Date(t).toISOString()) <= dayKey(to.toISOString()) && guard < 400; t += 86_400_000, guard++) {
    const day = dayKey(new Date(t).toISOString());
    if (daily.at(-1)?.day !== day) daily.push({ day, sent: sentByDay.get(day) ?? 0, replies: repliesByDay.get(day) ?? 0 });
  }

  return {
    range: { from: opts.from?.toISOString() ?? null, to: to.toISOString(), days: opts.from ? Math.round((to.getTime() - opts.from.getTime()) / 86_400_000) : null },
    totals: {
      sent: logs.length,
      delivered,
      bounced,
      contacted: leads.length,
      open: rate(openedLogs.size, delivered),
      click: rate(clickedLogs.size, delivered),
      reply: rate(repliedLeads.size, leads.length),
      positive: rate(positiveLeads.size, leads.length),
      bounce: rate(bounced, logs.length),
      portfolio: rate(visitedLeads.size, leads.length),
      botHitsFiltered: events.filter(isBot).length,
    },
    funnel,
    byTouch,
    byTrack: segment((l) => l.role_track),
    byGeo: segment((l) => l.geo_region),
    daily,
  };
}
