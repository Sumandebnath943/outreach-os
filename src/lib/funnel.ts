/**
 * Funnel & sequencer rules — pure and isomorphic so the worker, the API routes
 * and the dashboard all apply exactly the same logic (and so it is unit-testable).
 */
import { formatInTimeZone } from "date-fns-tz";
import type { HolidaySettings } from "./holidays";
import { addBusinessDaysInTz, addCalendarDays } from "./schedule";
import {
  CLOSED_SUB_STAGES,
  INTERVIEW_SUB_STAGES,
  type BranchVariant,
  type FunnelStage,
  type Lead,
  type SequenceTemplate,
  type SystemSettings,
} from "./types";

/** Stages in which the automated sequencer is allowed to send. */
export const SENDABLE_STAGES: FunnelStage[] = ["LEAD_QUEUED", "OUTREACH_ACTIVE", "WARM_ENGAGED"];

/** Business-day waits before each touch when no template overrides them. */
export const DEFAULT_WAITS: Record<number, number> = { 1: 0, 2: 3, 3: 5, 4: 6 };

/** Ghosted leads keep being watched for a late reply for this many days after archiving. */
export const LATE_REPLY_WINDOW_DAYS = 30;

/** Inbound mail this long before the first send still counts (clock skew between Gmail and our log). */
const INBOUND_SLACK_MS = 10 * 60 * 1000;

type Engagement = Pick<Lead, "click_count" | "portfolio_visit_count" | "open_count">;

/** Warm intent = clicked, visited the portfolio, or opened 2+ times. */
export function isWarm(lead: Engagement): boolean {
  return lead.click_count >= 1 || lead.portfolio_visit_count >= 1 || lead.open_count >= 2;
}

/** Touch 2 branches into WARM (2A) or COLD (2B); every other touch is STANDARD. */
export function branchFor(lead: Engagement, touch: number): BranchVariant {
  if (touch !== 2) return "STANDARD";
  return isWarm(lead) ? "WARM" : "COLD";
}

/**
 * Template for a track/touch/variant. Role tracks inherit HYBRID_DEFAULT; Touch 2 falls back to the
 * other branch only when the requested one is missing everywhere.
 */
export function pickTemplate(
  templates: SequenceTemplate[],
  track: Lead["role_track"],
  touch: number,
  variant: BranchVariant,
): SequenceTemplate | undefined {
  const find = (t: string, v: BranchVariant) =>
    templates.find((x) => x.role_track === t && x.touch_number === touch && x.branch_variant === v);
  const other: BranchVariant = variant === "WARM" ? "COLD" : "WARM";
  return (
    find(track, variant) ??
    find("HYBRID_DEFAULT", variant) ??
    find(track, "STANDARD") ??
    find("HYBRID_DEFAULT", "STANDARD") ??
    (touch === 2 ? (find(track, other) ?? find("HYBRID_DEFAULT", other)) : undefined)
  );
}

/** Business days to wait before `touch`. Both Touch 2 branches share one wait (kept in sync on save). */
export function waitFor(templates: SequenceTemplate[], track: Lead["role_track"], touch: number): number {
  const t = pickTemplate(templates, track, touch, touch === 2 ? "WARM" : "STANDARD");
  return t?.wait_business_days ?? DEFAULT_WAITS[touch] ?? 3;
}

/**
 * When a resumed sequence's next touch is due: the original schedule (last send + the next
 * touch's wait, in the recipient's business days), or now if that moment has already passed.
 * Resuming after an early auto-reply therefore never fires a follow-up ahead of schedule.
 */
export function resumeDueAt(
  lastSentAt: Date | null,
  waitBusinessDays: number,
  geo: Lead["geo_region"],
  now = new Date(),
  holidays: HolidaySettings = {},
): Date {
  if (!lastSentAt) return now;
  const due = addBusinessDaysInTz(lastSentAt, waitBusinessDays, geo, holidays);
  return due > now ? due : now;
}

/** New-sender warm-up: daily cap per week since the warm-up started (never above the configured cap). */
export const WARMUP_STEPS = [10, 20, 30];

export function effectiveDailyLimit(
  s: Pick<SystemSettings, "daily_send_limit" | "warmup_enabled" | "warmup_started_on">,
  now = new Date(),
  tz = "Asia/Kolkata",
): { cap: number; warmupWeek: number | null } {
  if (!s.warmup_enabled || !s.warmup_started_on) return { cap: s.daily_send_limit, warmupWeek: null };
  const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${s.warmup_started_on.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  const week = Math.max(0, Math.floor(days / 7)) + 1;
  if (week > WARMUP_STEPS.length) return { cap: s.daily_send_limit, warmupWeek: null };
  return { cap: Math.min(s.daily_send_limit, WARMUP_STEPS[week - 1]), warmupWeek: week };
}

/** Stage a lead returns to when its sequence is resumed by hand. */
export function resumeStageFor(lead: Engagement & Pick<Lead, "current_touch">): FunnelStage {
  if (isWarm(lead)) return "WARM_ENGAGED";
  return lead.current_touch === 0 ? "LEAD_QUEUED" : "OUTREACH_ACTIVE";
}

/**
 * Only inbound mail newer than this instant can stop the sequence. It starts just before the first
 * send and moves past any reply already handled — so resuming after an out-of-office auto-reply
 * does not immediately re-trigger the kill-switch on that same message.
 */
export function inboundCutoff(firstSentAt: Date | null | undefined, lead: Pick<Lead, "created_at" | "replied_at">): Date {
  const base = new Date((firstSentAt ?? new Date(lead.created_at)).getTime() - INBOUND_SLACK_MS);
  const replied = lead.replied_at ? new Date(lead.replied_at) : null;
  return replied && replied > base ? replied : base;
}

/** Side effects of manually moving a lead to a stage (Kanban drag / dossier). */
export function stageSideEffects(
  lead: Lead,
  to: FunnelStage,
  settings: Pick<SystemSettings, "reengage_after_days">,
  now = new Date(),
): Partial<Lead> {
  const patch: Partial<Lead> = { funnel_stage: to };
  const stop = () => {
    patch.sequence_active = false;
    patch.next_touch_due_at = null;
  };
  switch (to) {
    case "LEAD_QUEUED":
    case "OUTREACH_ACTIVE":
    case "WARM_ENGAGED":
      if (lead.current_touch < 4) {
        patch.sequence_active = true;
        patch.next_touch_due_at = lead.next_touch_due_at ?? now.toISOString();
      }
      if (lead.funnel_stage === "CLOSED_ARCHIVE" || lead.funnel_stage === "NURTURE_LATER") patch.sub_stage = null;
      break;
    case "REPLIED_TRIAGE":
    case "OFFER_STAGE":
      stop();
      break;
    case "INTERVIEWING":
      stop();
      if (!lead.sub_stage || !(INTERVIEW_SUB_STAGES as readonly string[]).includes(lead.sub_stage)) patch.sub_stage = "HR_SCREEN";
      break;
    case "NURTURE_LATER":
      stop();
      patch.reengage_at = lead.reengage_at ?? addCalendarDays(now, settings.reengage_after_days ?? 60).toISOString();
      break;
    case "CLOSED_ARCHIVE":
      stop();
      patch.archived_at = now.toISOString();
      if (!lead.sub_stage || !(CLOSED_SUB_STAGES as readonly string[]).includes(lead.sub_stage)) patch.sub_stage = "REJECTED";
      break;
  }
  return patch;
}
