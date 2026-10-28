export type SendProvider = 'GMAIL' | 'RESEND';
export type ExecutionMode = 'AUTO_PILOT' | 'APPROVAL_GATE';
export type GeoRegion = 'INDIA' | 'US' | 'GLOBAL';
export type RoleTrack = 'HYBRID_DEFAULT' | 'BRAND' | 'AI_PMM' | 'AI_PM';
export type BranchVariant = 'STANDARD' | 'WARM' | 'COLD';

export type FunnelStage =
  | 'LEAD_QUEUED'
  | 'OUTREACH_ACTIVE'
  | 'WARM_ENGAGED'
  | 'REPLIED_TRIAGE'
  | 'INTERVIEWING'
  | 'OFFER_STAGE'
  | 'NURTURE_LATER'
  | 'CLOSED_ARCHIVE';

export type SubStage =
  | 'HR_SCREEN'
  | 'HIRING_MANAGER'
  | 'CASE_STUDY'
  | 'FINAL_ROUND'
  | 'BOUNCED'
  | 'GHOSTED'
  | 'REJECTED'
  | null;

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'PAUSED';
export type EmailLogStatus = 'QUEUED_FOR_APPROVAL' | 'SENT' | 'BOUNCED' | 'FAILED';
export type TrackingEventType =
  | 'EMAIL_OPEN'
  | 'LINK_CLICK'
  | 'PORTFOLIO_VIEW'
  | 'REPLY_RECEIVED'
  | 'STAGE_CHANGE';

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

  // 8-Stage Funnel State
  funnel_stage: FunnelStage;
  sub_stage: SubStage;

  // Sequencer State
  sequence_active: boolean;
  current_touch: number; // 0 = not started, 1..4 = last touch sent
  next_touch_due_at: string | null;
  approval_status: ApprovalStatus;

  // Threading & Telemetry Counters
  gmail_thread_id: string | null;
  last_message_id_header: string | null;
  references_header: string | null;
  original_subject: string | null;
  open_count: number;
  click_count: number;
  portfolio_visit_count: number;
  portfolio_pages_viewed: string[];
  last_engaged_at: string | null;
  replied_at: string | null;
  reply_snippet: string | null;
  reply_sentiment: string | null;
  reengage_at: string | null;
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
  status: EmailLogStatus;
  sent_at: string;
}

export interface TrackingEvent {
  id: string;
  lead_id: string;
  email_log_id: string | null;
  event_type: TrackingEventType;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface GlobalKPIs {
  total_leads: number;
  active_in_sequence: number;
  warm_engaged: number;
  replies_needing_triage: number;
  active_interviews: number;
  offer_stage: number;
  sent_today: number;
  daily_send_limit: number;
  pending_approvals: number;
  storage_engine: 'SUPABASE' | 'LOCAL_JSON';
  email_credentials_ready: boolean;
}

export interface FunnelStageMeta {
  id: FunnelStage;
  number: string;
  name: string;
  shortDesc: string;
  accentColor: string;
  badgeClass: string;
}

export const FUNNEL_STAGES: FunnelStageMeta[] = [
  {
    id: 'LEAD_QUEUED',
    number: '01',
    name: 'Lead Queued',
    shortDesc: 'Validated & awaiting Touch 1 dispatch',
    accentColor: '#A1A1AA',
    badgeClass: 'border-zinc-700 bg-zinc-900/80 text-zinc-300',
  },
  {
    id: 'OUTREACH_ACTIVE',
    number: '02',
    name: 'Outreach Active',
    shortDesc: 'In 4-touch cadence · Monitoring telemetry',
    accentColor: '#38BDF8',
    badgeClass: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  },
  {
    id: 'WARM_ENGAGED',
    number: '03',
    name: 'Warm Engaged',
    shortDesc: 'Clicked link, visited portfolio, or 2+ opens',
    accentColor: '#F59E0B',
    badgeClass: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  },
  {
    id: 'REPLIED_TRIAGE',
    number: '04',
    name: 'Replied (Triage)',
    shortDesc: 'Inbound reply detected · Sequence halted',
    accentColor: '#10B981',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  },
  {
    id: 'INTERVIEWING',
    number: '05',
    name: 'Interviewing',
    shortDesc: 'HR Screen → HM → Case Study → Final',
    accentColor: '#818CF8',
    badgeClass: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400',
  },
  {
    id: 'OFFER_STAGE',
    number: '06',
    name: 'Offer & Closing',
    shortDesc: 'Comp negotiation & decision timeline',
    accentColor: '#34D399',
    badgeClass: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300',
  },
  {
    id: 'NURTURE_LATER',
    number: '07',
    name: 'Nurture / Future',
    shortDesc: 'Paused for future quarter re-engagement',
    accentColor: '#A855F7',
    badgeClass: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  },
  {
    id: 'CLOSED_ARCHIVE',
    number: '08',
    name: 'Closed / Archive',
    shortDesc: 'Bounced, ghosted after T4, or closed',
    accentColor: '#F43F5E',
    badgeClass: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
  },
];

export const ROLE_TRACK_META: Record<
  RoleTrack,
  { label: string; shortLabel: string; badgeClass: string; defaultRoleTitle: string }
> = {
  HYBRID_DEFAULT: {
    label: 'Hybrid (Brand + AI Builder)',
    shortLabel: 'HYBRID',
    badgeClass: 'border-zinc-600 bg-zinc-800/90 text-zinc-200',
    defaultRoleTitle: 'Senior Brand Marketing / AI Product Marketing',
  },
  BRAND: {
    label: 'Senior Brand Marketing Manager',
    shortLabel: 'BRAND',
    badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    defaultRoleTitle: 'Senior Brand Marketing Manager',
  },
  AI_PMM: {
    label: 'AI Product Marketing Manager (AI PMM)',
    shortLabel: 'AI_PMM',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    defaultRoleTitle: 'AI Product Marketing Manager (AI PMM)',
  },
  AI_PM: {
    label: 'AI Product Manager (AI PM)',
    shortLabel: 'AI_PM',
    badgeClass: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    defaultRoleTitle: 'AI Product Manager (AI PM)',
  },
};

export const GEO_REGION_META: Record<
  GeoRegion,
  { label: string; code: string; timezone: string; windowLabel: string; badgeClass: string }
> = {
  INDIA: {
    label: 'India (IST)',
    code: 'IN',
    timezone: 'Asia/Kolkata',
    windowLabel: 'Mon–Fri · 10:00–18:00 IST',
    badgeClass: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  },
  US: {
    label: 'United States (EST)',
    code: 'US',
    timezone: 'America/New_York',
    windowLabel: 'Mon–Fri · 09:00–17:00 EST',
    badgeClass: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  },
  GLOBAL: {
    label: 'Global (UTC)',
    code: 'GLB',
    timezone: 'UTC',
    windowLabel: 'Mon–Fri · 09:00–18:00 UTC',
    badgeClass: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300',
  },
};
