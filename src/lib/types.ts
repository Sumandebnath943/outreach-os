export const FUNNEL_STAGES = [
  "LEAD_QUEUED",
  "OUTREACH_ACTIVE",
  "WARM_ENGAGED",
  "REPLIED_TRIAGE",
  "INTERVIEWING",
  "OFFER_STAGE",
  "NURTURE_LATER",
  "CLOSED_ARCHIVE",
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const ROLE_TRACKS = ["HYBRID_DEFAULT", "BRAND", "AI_PMM", "AI_PM"] as const;
export type RoleTrack = (typeof ROLE_TRACKS)[number];

export const GEO_REGIONS = ["INDIA", "US", "GLOBAL"] as const;
export type GeoRegion = (typeof GEO_REGIONS)[number];

export const BRANCH_VARIANTS = ["STANDARD", "WARM", "COLD"] as const;
export type BranchVariant = (typeof BRANCH_VARIANTS)[number];

export type ApprovalStatus = "PENDING" | "APPROVED" | "PAUSED";
export type SendProvider = "GMAIL" | "RESEND";
export type ExecutionMode = "AUTO_PILOT" | "APPROVAL_GATE";
export type EmailStatus = "QUEUED_FOR_APPROVAL" | "SENT" | "BOUNCED" | "FAILED";
export type EventType = "EMAIL_OPEN" | "LINK_CLICK" | "PORTFOLIO_VIEW" | "REPLY_RECEIVED" | "STAGE_CHANGE";

export const INTERVIEW_SUB_STAGES = ["HR_SCREEN", "HIRING_MANAGER", "CASE_STUDY", "FINAL_ROUND"] as const;
export const CLOSED_SUB_STAGES = ["BOUNCED", "GHOSTED", "REJECTED", "WITHDRAWN", "HIRED"] as const;

export interface SystemSettings {
  id: number;
  send_provider: SendProvider;
  execution_mode: ExecutionMode;
  daily_send_limit: number;
  min_delay_minutes: number;
  max_delay_minutes: number;
  sender_name: string;
  sender_email: string;
  portfolio_base_url: string;
  resume_url: string;
  gmail_refresh_token: string | null;
  india_window_start: number;
  india_window_end: number;
  us_window_start: number;
  us_window_end: number;
  global_window_start: number;
  global_window_end: number;
  archive_after_business_days: number;
  reengage_after_days: number;
  next_dispatch_at: string | null;
  last_queue_run_at: string | null;
  /** Owner-timezone date (YYYY-MM-DD) of the last Telegram digest. */
  last_digest_on: string | null;
  /** Skip public holidays (India / US) when sending and counting business days. */
  skip_holidays: boolean;
  /** Extra no-send dates for every region, YYYY-MM-DD, comma separated. */
  extra_blackout_dates: string | null;
  /** New-sender warm-up: ramp the daily cap up over the first weeks. */
  warmup_enabled: boolean;
  warmup_started_on: string | null;
  /** Out-of-office replies resume the sequence automatically after the person is back. */
  auto_resume_ooo: boolean;
  updated_at: string;
}

export interface SequenceTemplate {
  id: string;
  role_track: RoleTrack;
  touch_number: 1 | 2 | 3 | 4;
  branch_variant: BranchVariant;
  subject_template: string;
  body_template: string;
  wait_business_days: number;
  same_thread: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string;
  company_name: string;
  job_title: string | null;
  linkedin_url: string | null;
  company_website: string | null;
  target_role_opening: string | null;
  geo_region: GeoRegion;
  role_track: RoleTrack;
  custom_icebreaker: string | null;
  funnel_stage: FunnelStage;
  sub_stage: string | null;
  sequence_active: boolean;
  current_touch: number;
  next_touch_due_at: string | null;
  approval_status: ApprovalStatus;
  gmail_thread_id: string | null;
  last_message_id_header: string | null;
  references_header: string | null;
  original_subject: string | null;
  open_count: number;
  click_count: number;
  portfolio_visit_count: number;
  portfolio_pages_viewed: string[] | null;
  last_engaged_at: string | null;
  replied_at: string | null;
  reply_snippet: string | null;
  reply_sentiment: string | null;
  reengage_at: string | null;
  /** When the lead last entered CLOSED_ARCHIVE (drives the late-reply watch). */
  archived_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailLog {
  id: string;
  lead_id: string;
  touch_number: number;
  branch_variant: BranchVariant;
  subject: string;
  body_html: string;
  provider: string;
  provider_message_id: string | null;
  rfc_message_id: string | null;
  gmail_thread_id: string | null;
  status: EmailStatus;
  sent_at: string;
  error: string | null;
}

export interface TrackingEvent {
  id: string;
  lead_id: string;
  email_log_id: string | null;
  event_type: EventType;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DashboardStats {
  total: number;
  activeInSequence: number;
  warm: number;
  triage: number;
  interviewing: number;
  sentToday: number;
  /** Today's effective cap (lower while the new-sender warm-up is running). */
  dailyLimit: number;
  warmupWeek: number | null;
  executionMode: ExecutionMode;
  sendProvider: SendProvider;
  pendingApprovals: number;
  nextDispatchAt: string | null;
  lastQueueRunAt: string | null;
  gmailConnected: boolean;
  byStage: Record<FunnelStage, number>;
}

/** A due touch rendered for the Morning Approval Queue. */
export interface ApprovalItem {
  lead: Lead;
  touchNumber: number;
  variant: BranchVariant;
  subject: string;
  body: string;
  hasDraft: boolean;
  inWindow: boolean;
  dueAt: string | null;
  error?: string;
}

/** Result of one run of the master queue worker. */
export interface QueueReport {
  ranAt: string;
  trigger: string;
  mode: ExecutionMode;
  provider: SendProvider;
  gmailConnected: boolean;
  resurfaced: number;
  repliesChecked: number;
  repliesDetected: number;
  bounces: number;
  archived: number;
  dueCandidates: number;
  inWindow: number;
  sent: { leadId: string; email: string; touch: number; variant: string }[];
  failed: { leadId: string; email: string; error: string }[];
  quota: { sent: number; limit: number };
  nextDispatchAt: string | null;
  notes: string[];
}

export type ImportRowResult =
  | { row: number; status: "NEW"; lead: import("./ingest").NormalizedLead }
  | { row: number; status: "INVALID"; error: string }
  | { row: number; status: "DUPLICATE_IN_FILE"; email: string }
  | { row: number; status: "DUPLICATE_EXISTING"; email: string; stage: string; locked: boolean };

export interface ImportResponse {
  dryRun: boolean;
  summary: { total: number; new: number; inserted: number; invalid: number; duplicateInFile: number; duplicateExisting: number };
  results: ImportRowResult[];
}
