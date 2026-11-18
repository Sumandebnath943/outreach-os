import type { FunnelStage, GeoRegion, RoleTrack } from "./types";

export const STAGE_META: Record<FunnelStage, { n: string; label: string; accent: string; dot: string }> = {
  LEAD_QUEUED: { n: "01", label: "Lead Queued", accent: "text-zinc-400", dot: "bg-zinc-500" },
  OUTREACH_ACTIVE: { n: "02", label: "Outreach Active", accent: "text-sky-400", dot: "bg-sky-400" },
  WARM_ENGAGED: { n: "03", label: "Warm Engaged", accent: "text-amber-400", dot: "bg-amber-400" },
  REPLIED_TRIAGE: { n: "04", label: "Replied · Triage", accent: "text-emerald-400", dot: "bg-emerald-400" },
  INTERVIEWING: { n: "05", label: "Interviewing", accent: "text-emerald-300", dot: "bg-emerald-300" },
  OFFER_STAGE: { n: "06", label: "Offer & Closing", accent: "text-emerald-200", dot: "bg-emerald-200" },
  NURTURE_LATER: { n: "07", label: "Nurture / Future", accent: "text-violet-300", dot: "bg-violet-300" },
  CLOSED_ARCHIVE: { n: "08", label: "Closed / Archive", accent: "text-rose-400", dot: "bg-rose-400" },
};

export const TRACK_LABEL: Record<RoleTrack, string> = {
  HYBRID_DEFAULT: "HYBRID",
  BRAND: "BRAND",
  AI_PMM: "AI_PMM",
  AI_PM: "AI_PM",
};

export const GEO_LABEL: Record<GeoRegion, string> = { INDIA: "IN", US: "US", GLOBAL: "GL" };

export const GEO_TZ: Record<GeoRegion, string> = {
  INDIA: "Asia/Kolkata",
  US: "America/New_York",
  GLOBAL: "UTC",
};

export const TOUCH_SLOTS = [
  { touch: 1, variant: "STANDARD", short: "T1", label: "Touch 1 · Cold Pitch" },
  { touch: 2, variant: "WARM", short: "T2A", label: "Touch 2A · Warm Walkthrough" },
  { touch: 2, variant: "COLD", short: "T2B", label: "Touch 2B · Cold Proof Bump" },
  { touch: 3, variant: "STANDARD", short: "T3", label: "Touch 3 · Value Shift" },
  { touch: 4, variant: "STANDARD", short: "T4", label: "Touch 4 · Polite Breakup" },
] as const;

/** "T2A" / "Touch 2A · Warm Walkthrough" for a touch number + branch variant. */
export function touchLabel(touch: number, variant: string, long = false): string {
  const slot = TOUCH_SLOTS.find((s) => s.touch === touch && (touch !== 2 || s.variant === variant)) ?? (touch === 2 ? TOUCH_SLOTS[2] : undefined);
  if (!slot) return long ? `Touch ${touch}` : `T${touch}`;
  return long ? slot.label : slot.short;
}

export const TEMPLATE_VARIABLES = [
  "{{first_name}}",
  "{{company_name}}",
  "{{target_role_opening}}",
  "{{custom_icebreaker}}",
  "{{tracked_portfolio_url|my portfolio}}",
  "{{tracked_resume_url|Résumé}}",
  "{{tracked_linkedin_url|LinkedIn}}",
  "{{signature}}",
  "{{original_subject}}",
];
