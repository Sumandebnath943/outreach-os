import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ApprovalStatus,
  BranchVariant,
  EmailLog,
  FunnelStage,
  GeoRegion,
  GlobalKPIs,
  Lead,
  RoleTrack,
  SequenceTemplate,
  SubStage,
  SystemSettings,
  TrackingEvent,
  TrackingEventType,
} from '@/types/outreach';
import {
  DEFAULT_SYSTEM_SETTINGS,
  INITIAL_DEMO_EVENTS,
  INITIAL_DEMO_LEADS,
  INITIAL_DEMO_LOGS,
  SEED_SEQUENCE_TEMPLATES,
} from '@/lib/seed-templates';
import { addBusinessDaysForGeo } from '@/lib/timezone';
import { renderSequenceEmail, resolveNextTouchVariant } from '@/lib/template-engine';
import { dispatchOutreachEmail, hasLiveEmailCredentials } from '@/lib/email-engine';

interface LocalDatabaseSchema {
  system_settings: SystemSettings;
  sequence_templates: SequenceTemplate[];
  leads: Lead[];
  email_logs: EmailLog[];
  tracking_events: TrackingEvent[];
}

let cachedSupabase: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && url.startsWith('http'));
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cachedSupabase) return cachedSupabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

  cachedSupabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedSupabase;
}

// ============================================================================
// LOCAL JSON FALLBACK STORE (Used when Supabase env vars are not set yet)
// ============================================================================

const LOCAL_DB_DIR = path.join(process.cwd(), '.data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'local-db.json');

let inMemoryFallback: LocalDatabaseSchema | null = null;

function createInitialLocalDb(): LocalDatabaseSchema {
  const now = new Date().toISOString();
  const templates: SequenceTemplate[] = SEED_SEQUENCE_TEMPLATES.map((t, index) => ({
    ...t,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    created_at: now,
  }));

  return {
    system_settings: { ...DEFAULT_SYSTEM_SETTINGS },
    sequence_templates: templates,
    leads: [...INITIAL_DEMO_LEADS],
    email_logs: [...INITIAL_DEMO_LOGS],
    tracking_events: [...INITIAL_DEMO_EVENTS],
  };
}

function readLocalDb(): LocalDatabaseSchema {
  if (inMemoryFallback) {
    try {
      if (fs.existsSync(LOCAL_DB_FILE)) {
        const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf-8');
        inMemoryFallback = JSON.parse(raw) as LocalDatabaseSchema;
      }
    } catch {
      // Return in-memory state
    }
    return inMemoryFallback;
  }

  try {
    if (fs.existsSync(LOCAL_DB_FILE)) {
      const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as LocalDatabaseSchema;
      inMemoryFallback = parsed;
      return parsed;
    }
  } catch {
    // Fallback to initial seed
  }

  const initial = createInitialLocalDb();
  inMemoryFallback = initial;
  writeLocalDb(initial);
  return initial;
}

function writeLocalDb(data: LocalDatabaseSchema): void {
  inMemoryFallback = data;
  try {
    if (!fs.existsSync(LOCAL_DB_DIR)) {
      fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Keep in memory if filesystem is read-only (e.g. serverless)
  }
}

// ============================================================================
// 1. SYSTEM SETTINGS
// ============================================================================

export async function getSystemSettings(): Promise<SystemSettings> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (!error && data) {
      return data as SystemSettings;
    }

    // Initialize singleton row if missing
    const { data: inserted } = await supabase
      .from('system_settings')
      .upsert({ ...DEFAULT_SYSTEM_SETTINGS, id: 1 })
      .select('*')
      .single();

    return (inserted as SystemSettings) || DEFAULT_SYSTEM_SETTINGS;
  }

  const db = readLocalDb();
  return db.system_settings;
}

export async function updateSystemSettings(
  patch: Partial<Omit<SystemSettings, 'id'>>
): Promise<SystemSettings> {
  const updatedAt = new Date().toISOString();
  const supabase = getSupabaseClient();

  if (supabase) {
    const current = await getSystemSettings();
    const merged = {
      ...current,
      ...patch,
      id: 1,
      updated_at: updatedAt,
    };
    const { data, error } = await supabase
      .from('system_settings')
      .upsert(merged)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as SystemSettings;
  }

  const db = readLocalDb();
  db.system_settings = {
    ...db.system_settings,
    ...patch,
    id: 1,
    updated_at: updatedAt,
  };
  writeLocalDb(db);
  return db.system_settings;
}

// ============================================================================
// 2. SEQUENCE TEMPLATES
// ============================================================================

export async function getSequenceTemplates(): Promise<SequenceTemplate[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('sequence_templates')
      .select('*')
      .order('role_track', { ascending: true })
      .order('touch_number', { ascending: true })
      .order('branch_variant', { ascending: true });

    if (!error && data && data.length > 0) {
      return data as SequenceTemplate[];
    }

    // Auto-seed templates if table is empty
    const { data: seeded } = await supabase
      .from('sequence_templates')
      .upsert(SEED_SEQUENCE_TEMPLATES, {
        onConflict: 'role_track,touch_number,branch_variant',
      })
      .select('*');

    return (seeded as SequenceTemplate[]) || [];
  }

  const db = readLocalDb();
  return db.sequence_templates;
}

export async function findSequenceTemplate(
  roleTrack: RoleTrack,
  touchNumber: 1 | 2 | 3 | 4,
  branchVariant: BranchVariant
): Promise<SequenceTemplate> {
  const templates = await getSequenceTemplates();

  // Exact match
  const exact = templates.find(
    (t) =>
      t.role_track === roleTrack &&
      t.touch_number === touchNumber &&
      t.branch_variant === branchVariant
  );
  if (exact) return exact;

  // Fallback to HYBRID_DEFAULT for same touch & branch
  const hybridFallback = templates.find(
    (t) =>
      t.role_track === 'HYBRID_DEFAULT' &&
      t.touch_number === touchNumber &&
      t.branch_variant === branchVariant
  );
  if (hybridFallback) return hybridFallback;

  // Fallback to STANDARD variant
  const standardFallback = templates.find(
    (t) => t.role_track === roleTrack && t.touch_number === touchNumber
  );
  if (standardFallback) return standardFallback;

  return templates[0];
}

export async function upsertSequenceTemplate(
  input: Partial<SequenceTemplate> & {
    role_track: RoleTrack;
    touch_number: 1 | 2 | 3 | 4;
    branch_variant: BranchVariant;
    subject_template: string;
    body_template: string;
  }
): Promise<SequenceTemplate> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const payload = {
      role_track: input.role_track,
      touch_number: input.touch_number,
      branch_variant: input.branch_variant,
      subject_template: input.subject_template,
      body_template: input.body_template,
      wait_business_days: input.wait_business_days ?? 0,
      same_thread: input.same_thread ?? input.touch_number > 1,
    };

    const { data, error } = await supabase
      .from('sequence_templates')
      .upsert(payload, { onConflict: 'role_track,touch_number,branch_variant' })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as SequenceTemplate;
  }

  const db = readLocalDb();
  const idx = db.sequence_templates.findIndex(
    (t) =>
      t.role_track === input.role_track &&
      t.touch_number === input.touch_number &&
      t.branch_variant === input.branch_variant
  );

  if (idx >= 0) {
    db.sequence_templates[idx] = {
      ...db.sequence_templates[idx],
      subject_template: input.subject_template,
      body_template: input.body_template,
      wait_business_days:
        input.wait_business_days ?? db.sequence_templates[idx].wait_business_days,
      same_thread: input.same_thread ?? db.sequence_templates[idx].same_thread,
    };
    writeLocalDb(db);
    return db.sequence_templates[idx];
  }

  const created: SequenceTemplate = {
    id: crypto.randomUUID(),
    role_track: input.role_track,
    touch_number: input.touch_number,
    branch_variant: input.branch_variant,
    subject_template: input.subject_template,
    body_template: input.body_template,
    wait_business_days: input.wait_business_days ?? 0,
    same_thread: input.same_thread ?? input.touch_number > 1,
    created_at: new Date().toISOString(),
  };
  db.sequence_templates.push(created);
  writeLocalDb(db);
  return created;
}

// ============================================================================
// 3. LEADS CRUD & BULK IMPORT
// ============================================================================

export interface LeadFilters {
  stage?: FunnelStage | 'ALL';
  geo_region?: GeoRegion | 'ALL';
  role_track?: RoleTrack | 'ALL';
  search?: string;
}

export async function getLeads(filters?: LeadFilters): Promise<Lead[]> {
  const supabase = getSupabaseClient();
  let rows: Lead[] = [];

  if (supabase) {
    let query = supabase
      .from('leads')
      .select('*')
      .order('updated_at', { ascending: false });

    if (filters?.stage && filters.stage !== 'ALL') {
      query = query.eq('funnel_stage', filters.stage);
    }
    if (filters?.geo_region && filters.geo_region !== 'ALL') {
      query = query.eq('geo_region', filters.geo_region);
    }
    if (filters?.role_track && filters.role_track !== 'ALL') {
      query = query.eq('role_track', filters.role_track);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows = (data as Lead[]) || [];
  } else {
    const db = readLocalDb();
    rows = [...db.leads].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    if (filters?.stage && filters.stage !== 'ALL') {
      rows = rows.filter((l) => l.funnel_stage === filters.stage);
    }
    if (filters?.geo_region && filters.geo_region !== 'ALL') {
      rows = rows.filter((l) => l.geo_region === filters.geo_region);
    }
    if (filters?.role_track && filters.role_track !== 'ALL') {
      rows = rows.filter((l) => l.role_track === filters.role_track);
    }
  }

  if (filters?.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    rows = rows.filter(
      (l) =>
        l.company_name.toLowerCase().includes(q) ||
        l.first_name.toLowerCase().includes(q) ||
        (l.last_name || '').toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.job_title || '').toLowerCase().includes(q) ||
        (l.target_role_opening || '').toLowerCase().includes(q)
    );
  }

  return rows;
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) return null;
    return (data as Lead) || null;
  }

  const db = readLocalDb();
  return db.leads.find((l) => l.id === id) || null;
}

export async function createLead(input: {
  first_name?: string;
  last_name?: string | null;
  email: string;
  company_name: string;
  job_title?: string | null;
  linkedin_url?: string | null;
  company_website?: string | null;
  target_role_opening?: string | null;
  geo_region?: GeoRegion;
  role_track?: RoleTrack;
  custom_icebreaker?: string | null;
  notes?: string | null;
}): Promise<Lead> {
  const settings = await getSystemSettings();
  const now = new Date().toISOString();
  const cleanEmail = input.email.trim().toLowerCase();

  const defaultApproval: ApprovalStatus =
    settings.execution_mode === 'AUTO_PILOT' ? 'APPROVED' : 'PENDING';

  const newLead: Lead = {
    id: crypto.randomUUID(),
    first_name: (input.first_name || '').trim() || 'Team',
    last_name: input.last_name?.trim() || null,
    email: cleanEmail,
    company_name: input.company_name.trim(),
    job_title: input.job_title?.trim() || null,
    linkedin_url: input.linkedin_url?.trim() || null,
    company_website: input.company_website?.trim() || null,
    target_role_opening: input.target_role_opening?.trim() || null,
    geo_region: input.geo_region || 'INDIA',
    role_track: input.role_track || 'HYBRID_DEFAULT',
    custom_icebreaker: input.custom_icebreaker?.trim() || null,
    funnel_stage: 'LEAD_QUEUED',
    sub_stage: null,
    sequence_active: true,
    current_touch: 0,
    next_touch_due_at: now,
    approval_status: defaultApproval,
    gmail_thread_id: null,
    last_message_id_header: null,
    references_header: null,
    original_subject: null,
    open_count: 0,
    click_count: 0,
    portfolio_visit_count: 0,
    portfolio_pages_viewed: [],
    last_engaged_at: null,
    replied_at: null,
    reply_snippet: null,
    reply_sentiment: null,
    reengage_at: null,
    notes: input.notes?.trim() || null,
    created_at: now,
    updated_at: now,
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('leads')
      .insert(newLead)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as Lead;
  }

  const db = readLocalDb();
  const duplicate = db.leads.find((l) => l.email.toLowerCase() === cleanEmail);
  if (duplicate) {
    throw new Error(`Lead with email ${cleanEmail} already exists (${duplicate.company_name}).`);
  }
  db.leads.unshift(newLead);
  writeLocalDb(db);
  return newLead;
}

export async function updateLead(
  id: string,
  patch: Partial<Omit<Lead, 'id' | 'created_at'>>
): Promise<Lead> {
  const existing = await getLeadById(id);
  if (!existing) {
    throw new Error(`Lead ${id} not found`);
  }

  const now = new Date().toISOString();
  const updatedPatch: Partial<Lead> = {
    ...patch,
    updated_at: now,
  };

  // Automatic stage-transition side-effects
  if (patch.funnel_stage && patch.funnel_stage !== existing.funnel_stage) {
    if (
      patch.funnel_stage === 'REPLIED_TRIAGE' ||
      patch.funnel_stage === 'INTERVIEWING' ||
      patch.funnel_stage === 'OFFER_STAGE' ||
      patch.funnel_stage === 'CLOSED_ARCHIVE'
    ) {
      updatedPatch.sequence_active = false;
      updatedPatch.approval_status = 'PAUSED';
    } else if (patch.funnel_stage === 'NURTURE_LATER') {
      updatedPatch.sequence_active = false;
      updatedPatch.approval_status = 'PAUSED';
      if (!patch.reengage_at && !existing.reengage_at) {
        // Default +60 days per PRD
        updatedPatch.reengage_at = new Date(
          Date.now() + 60 * 24 * 60 * 60 * 1000
        ).toISOString();
      }
    }

    await createTrackingEvent({
      lead_id: id,
      email_log_id: null,
      event_type: 'STAGE_CHANGE',
      metadata: {
        from_stage: existing.funnel_stage,
        to_stage: patch.funnel_stage,
        sub_stage: patch.sub_stage ?? existing.sub_stage,
      },
    });
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('leads')
      .update(updatedPatch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as Lead;
  }

  const db = readLocalDb();
  const idx = db.leads.findIndex((l) => l.id === id);
  if (idx < 0) throw new Error(`Lead ${id} not found`);

  db.leads[idx] = {
    ...db.leads[idx],
    ...updatedPatch,
  };
  writeLocalDb(db);
  return db.leads[idx];
}

export async function deleteLead(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }

  const db = readLocalDb();
  db.leads = db.leads.filter((l) => l.id !== id);
  db.email_logs = db.email_logs.filter((e) => e.lead_id !== id);
  db.tracking_events = db.tracking_events.filter((t) => t.lead_id !== id);
  writeLocalDb(db);
}

/**
 * Classifies Role Track automatically from job_title or target_role_opening if not explicitly provided.
 */
export function inferRoleTrack(
  rawTrack?: string | null,
  targetRoleOpening?: string | null,
  jobTitle?: string | null
): RoleTrack {
  const normalizedTrack = (rawTrack || '').trim().toUpperCase();
  if (
    normalizedTrack === 'BRAND' ||
    normalizedTrack === 'AI_PMM' ||
    normalizedTrack === 'AI_PM' ||
    normalizedTrack === 'HYBRID_DEFAULT'
  ) {
    return normalizedTrack as RoleTrack;
  }

  const combined = `${targetRoleOpening || ''} ${jobTitle || ''}`.toLowerCase();
  if (
    combined.includes('product marketing') ||
    combined.includes('pmm') ||
    combined.includes('gtm')
  ) {
    return 'AI_PMM';
  }
  if (
    combined.includes('ai pm') ||
    combined.includes('product manager') ||
    combined.includes('head of ai') ||
    combined.includes('vp product')
  ) {
    return 'AI_PM';
  }
  if (
    combined.includes('brand') ||
    combined.includes('cmo') ||
    combined.includes('marketing manager') ||
    combined.includes('head of marketing')
  ) {
    return 'BRAND';
  }
  return 'HYBRID_DEFAULT';
}

export function inferGeoRegion(
  rawGeo?: string | null,
  email?: string | null,
  website?: string | null
): GeoRegion {
  const g = (rawGeo || '').trim().toUpperCase();
  if (g === 'INDIA' || g === 'IN' || g === 'IST') return 'INDIA';
  if (g === 'US' || g === 'USA' || g === 'UNITED STATES' || g === 'EST') return 'US';
  if (g === 'GLOBAL' || g === 'UTC' || g === 'UK' || g === 'EU') return 'GLOBAL';

  const domainContext = `${email || ''} ${website || ''}`.toLowerCase();
  if (domainContext.endsWith('.in') || domainContext.includes('.co.in')) {
    return 'INDIA';
  }
  return 'INDIA';
}

// ============================================================================
// 4. EMAIL LOGS & TRACKING EVENTS
// ============================================================================

export async function getEmailLogsForLead(leadId: string): Promise<EmailLog[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data } = await supabase
      .from('email_logs')
      .select('*')
      .eq('lead_id', leadId)
      .order('sent_at', { ascending: true });

    return (data as EmailLog[]) || [];
  }

  const db = readLocalDb();
  return db.email_logs
    .filter((e) => e.lead_id === leadId)
    .sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
}

export async function getTodaySentEmailCount(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startIso = startOfDay.toISOString();

  const supabase = getSupabaseClient();
  if (supabase) {
    const { count } = await supabase
      .from('email_logs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'SENT')
      .gte('sent_at', startIso);

    return count || 0;
  }

  const db = readLocalDb();
  return db.email_logs.filter(
    (e) => e.status === 'SENT' && e.sent_at >= startIso
  ).length;
}

export async function createEmailLog(
  input: Omit<EmailLog, 'id' | 'sent_at'> & { id?: string; sent_at?: string }
): Promise<EmailLog> {
  const logRow: EmailLog = {
    id: input.id || crypto.randomUUID(),
    lead_id: input.lead_id,
    touch_number: input.touch_number,
    branch_variant: input.branch_variant,
    subject: input.subject,
    body_html: input.body_html,
    provider: input.provider,
    provider_message_id: input.provider_message_id,
    rfc_message_id: input.rfc_message_id,
    gmail_thread_id: input.gmail_thread_id,
    status: input.status,
    sent_at: input.sent_at || new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('email_logs')
      .insert(logRow)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as EmailLog;
  }

  const db = readLocalDb();
  db.email_logs.push(logRow);
  writeLocalDb(db);
  return logRow;
}

export async function getTrackingEventsForLead(leadId: string): Promise<TrackingEvent[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data } = await supabase
      .from('tracking_events')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    return (data as TrackingEvent[]) || [];
  }

  const db = readLocalDb();
  return db.tracking_events
    .filter((t) => t.lead_id === leadId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function createTrackingEvent(input: {
  lead_id: string;
  email_log_id?: string | null;
  event_type: TrackingEventType;
  metadata?: Record<string, unknown>;
}): Promise<TrackingEvent> {
  const eventRow: TrackingEvent = {
    id: crypto.randomUUID(),
    lead_id: input.lead_id,
    email_log_id: input.email_log_id || null,
    event_type: input.event_type,
    metadata: input.metadata || {},
    created_at: new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data } = await supabase
      .from('tracking_events')
      .insert(eventRow)
      .select('*')
      .single();

    return (data as TrackingEvent) || eventRow;
  }

  const db = readLocalDb();
  db.tracking_events.unshift(eventRow);
  writeLocalDb(db);
  return eventRow;
}

// ============================================================================
// 5. TELEMETRY EVENT MUTATORS (OPEN, CLICK, PORTFOLIO WEBHOOK, REPLY)
// ============================================================================

export async function recordEmailOpen(params: {
  leadId: string;
  emailLogId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<Lead | null> {
  const lead = await getLeadById(params.leadId);
  if (!lead) return null;

  const newOpenCount = (lead.open_count || 0) + 1;
  const now = new Date().toISOString();

  // Promote to WARM_ENGAGED on 2+ opens if in LEAD_QUEUED or OUTREACH_ACTIVE
  const shouldPromoteToWarm =
    newOpenCount >= 2 &&
    (lead.funnel_stage === 'LEAD_QUEUED' || lead.funnel_stage === 'OUTREACH_ACTIVE');

  await createTrackingEvent({
    lead_id: lead.id,
    email_log_id: params.emailLogId && params.emailLogId !== 'preview' ? params.emailLogId : null,
    event_type: 'EMAIL_OPEN',
    metadata: {
      ...params.metadata,
      open_count: newOpenCount,
    },
  });

  return updateLead(lead.id, {
    open_count: newOpenCount,
    last_engaged_at: now,
    ...(shouldPromoteToWarm ? { funnel_stage: 'WARM_ENGAGED' } : {}),
  });
}

export async function recordLinkClick(params: {
  leadId: string;
  emailLogId?: string | null;
  targetUrl: string;
  linkType?: string;
  metadata?: Record<string, unknown>;
}): Promise<Lead | null> {
  const lead = await getLeadById(params.leadId);
  if (!lead) return null;

  const newClickCount = (lead.click_count || 0) + 1;
  const now = new Date().toISOString();

  // Immediately promote to WARM_ENGAGED if in LEAD_QUEUED or OUTREACH_ACTIVE
  const shouldPromoteToWarm =
    lead.funnel_stage === 'LEAD_QUEUED' || lead.funnel_stage === 'OUTREACH_ACTIVE';

  await createTrackingEvent({
    lead_id: lead.id,
    email_log_id: params.emailLogId && params.emailLogId !== 'preview' ? params.emailLogId : null,
    event_type: 'LINK_CLICK',
    metadata: {
      ...params.metadata,
      targetUrl: params.targetUrl,
      linkType: params.linkType || 'portfolio',
      click_count: newClickCount,
    },
  });

  return updateLead(lead.id, {
    click_count: newClickCount,
    last_engaged_at: now,
    ...(shouldPromoteToWarm ? { funnel_stage: 'WARM_ENGAGED' } : {}),
  });
}

export async function recordPortfolioView(params: {
  leadId: string;
  pagePath: string;
  durationSec?: number;
  metadata?: Record<string, unknown>;
}): Promise<Lead | null> {
  const lead = await getLeadById(params.leadId);
  if (!lead) return null;

  const newVisitCount = (lead.portfolio_visit_count || 0) + 1;
  const cleanPath = params.pagePath.startsWith('/') ? params.pagePath : `/${params.pagePath}`;
  const currentPages = Array.isArray(lead.portfolio_pages_viewed)
    ? lead.portfolio_pages_viewed
    : [];
  const updatedPages = currentPages.includes(cleanPath)
    ? currentPages
    : [...currentPages, cleanPath];

  const now = new Date().toISOString();
  const shouldPromoteToWarm =
    lead.funnel_stage === 'LEAD_QUEUED' || lead.funnel_stage === 'OUTREACH_ACTIVE';

  await createTrackingEvent({
    lead_id: lead.id,
    email_log_id: null,
    event_type: 'PORTFOLIO_VIEW',
    metadata: {
      ...params.metadata,
      path: cleanPath,
      durationSec: params.durationSec ?? 0,
      visit_count: newVisitCount,
    },
  });

  return updateLead(lead.id, {
    portfolio_visit_count: newVisitCount,
    portfolio_pages_viewed: updatedPages,
    last_engaged_at: now,
    ...(shouldPromoteToWarm ? { funnel_stage: 'WARM_ENGAGED' } : {}),
  });
}

export async function recordInboundReply(params: {
  leadId: string;
  snippet: string;
  repliedAt?: string;
  sentiment?: string;
  metadata?: Record<string, unknown>;
}): Promise<Lead | null> {
  const lead = await getLeadById(params.leadId);
  if (!lead) return null;

  const now = params.repliedAt || new Date().toISOString();

  await createTrackingEvent({
    lead_id: lead.id,
    email_log_id: null,
    event_type: 'REPLY_RECEIVED',
    metadata: {
      ...params.metadata,
      snippet: params.snippet,
    },
  });

  // HARD STOP: Immediately sets sequence_active = false and transitions to REPLIED_TRIAGE
  return updateLead(lead.id, {
    funnel_stage: 'REPLIED_TRIAGE',
    sequence_active: false,
    approval_status: 'PAUSED',
    next_touch_due_at: null,
    replied_at: now,
    last_engaged_at: now,
    reply_snippet: params.snippet,
    reply_sentiment: params.sentiment || 'POSITIVE',
  });
}

export async function recordHardBounce(params: {
  leadId: string;
  snippet: string;
  metadata?: Record<string, unknown>;
}): Promise<Lead | null> {
  const lead = await getLeadById(params.leadId);
  if (!lead) return null;

  return updateLead(lead.id, {
    funnel_stage: 'CLOSED_ARCHIVE',
    sub_stage: 'BOUNCED' as SubStage,
    sequence_active: false,
    approval_status: 'PAUSED',
    next_touch_due_at: null,
    notes: `${lead.notes ? lead.notes + '\n' : ''}[AUTO-BOUNCE]: ${params.snippet}`,
  });
}

// ============================================================================
// 6. CORE SEQUENCER TOUCH DISPATCHER
// ============================================================================

/**
 * Computes the wait_business_days until the NEXT step after sending `sentTouchNumber`.
 * Per PRD Section 4.1:
 * - After Touch 1 -> +3 Business Days for Touch 2A/2B
 * - After Touch 2 -> +5 Business Days for Touch 3 (Day 8)
 * - After Touch 3 -> +6 Business Days for Touch 4 (Day 14)
 * - After Touch 4 -> +4 Business Days for Auto-Archive check (Day 18)
 */
export function getWaitDaysAfterTouch(sentTouchNumber: number): number {
  if (sentTouchNumber === 1) return 3;
  if (sentTouchNumber === 2) return 5;
  if (sentTouchNumber === 3) return 6;
  return 4; // +4 business days after Touch 4 -> Day 18 Auto-Archive
}

export async function dispatchNextTouchForLead(params: {
  leadId: string;
  appBaseUrl: string;
  subjectOverride?: string;
  bodyOverride?: string;
  customIcebreakerOverride?: string;
}): Promise<{
  success: boolean;
  lead: Lead;
  emailLog?: EmailLog;
  error?: string;
}> {
  let lead = await getLeadById(params.leadId);
  if (!lead) {
    throw new Error(`Lead ${params.leadId} not found`);
  }

  if (params.customIcebreakerOverride !== undefined) {
    lead = await updateLead(lead.id, {
      custom_icebreaker: params.customIcebreakerOverride,
    });
  }

  const resolution = resolveNextTouchVariant(lead);
  if (!resolution) {
    return {
      success: false,
      lead,
      error: 'Lead has already completed all 4 touches.',
    };
  }

  const settings = await getSystemSettings();
  const template = await findSequenceTemplate(
    lead.role_track,
    resolution.touchNumber,
    resolution.branchVariant
  );

  const emailLogId = crypto.randomUUID();
  const rendered = renderSequenceEmail({
    lead,
    template,
    settings,
    appBaseUrl: params.appBaseUrl,
    emailLogId,
    subjectOverride: params.subjectOverride,
    bodyOverride: params.bodyOverride,
  });

  const dispatchResult = await dispatchOutreachEmail({
    lead,
    settings,
    subject: rendered.subject,
    bodyText: rendered.bodyText,
    bodyHtml: rendered.bodyHtml,
    sameThread: template.same_thread && resolution.touchNumber > 1,
  });

  if (!dispatchResult.success) {
    await createEmailLog({
      id: emailLogId,
      lead_id: lead.id,
      touch_number: resolution.touchNumber,
      branch_variant: resolution.branchVariant,
      subject: rendered.subject,
      body_html: rendered.bodyHtml,
      provider: dispatchResult.provider,
      provider_message_id: null,
      rfc_message_id: null,
      gmail_thread_id: lead.gmail_thread_id,
      status: 'FAILED',
    });

    return {
      success: false,
      lead,
      error: dispatchResult.error || 'Failed to dispatch email.',
    };
  }

  const emailLog = await createEmailLog({
    id: emailLogId,
    lead_id: lead.id,
    touch_number: resolution.touchNumber,
    branch_variant: resolution.branchVariant,
    subject: rendered.subject,
    body_html: rendered.bodyHtml,
    provider: dispatchResult.provider,
    provider_message_id: dispatchResult.providerMessageId,
    rfc_message_id: dispatchResult.rfcMessageId,
    gmail_thread_id: dispatchResult.gmailThreadId,
    status: 'SENT',
  });

  // Calculate next due date in recipient's timezone
  const waitBusinessDays = getWaitDaysAfterTouch(resolution.touchNumber);
  const nextDueDate = addBusinessDaysForGeo(
    new Date(),
    waitBusinessDays,
    lead.geo_region
  );

  // Determine updated funnel stage:
  // If LEAD_QUEUED -> promote to OUTREACH_ACTIVE (keep WARM_ENGAGED if already warm)
  const nextStage: FunnelStage =
    lead.funnel_stage === 'LEAD_QUEUED' ? 'OUTREACH_ACTIVE' : lead.funnel_stage;

  // Reset approval_status for the subsequent touch according to execution_mode
  const nextApprovalStatus: ApprovalStatus =
    settings.execution_mode === 'AUTO_PILOT' ? 'APPROVED' : 'PENDING';

  const updatedLead = await updateLead(lead.id, {
    funnel_stage: nextStage,
    current_touch: resolution.touchNumber,
    next_touch_due_at: nextDueDate.toISOString(),
    approval_status: nextApprovalStatus,
    gmail_thread_id: dispatchResult.gmailThreadId,
    last_message_id_header: dispatchResult.rfcMessageId,
    references_header: dispatchResult.updatedReferencesHeader,
    original_subject:
      resolution.touchNumber === 1
        ? rendered.subject
        : lead.original_subject || rendered.subject.replace(/^Re:\s*/i, ''),
  });

  return {
    success: true,
    lead: updatedLead,
    emailLog,
  };
}

// ============================================================================
// 7. GLOBAL KPIS
// ============================================================================

export async function getGlobalKPIs(): Promise<GlobalKPIs> {
  const [leads, settings, sentToday] = await Promise.all([
    getLeads(),
    getSystemSettings(),
    getTodaySentEmailCount(),
  ]);

  const now = new Date().toISOString();

  const activeInSequence = leads.filter(
    (l) =>
      l.sequence_active &&
      (l.funnel_stage === 'LEAD_QUEUED' ||
        l.funnel_stage === 'OUTREACH_ACTIVE' ||
        l.funnel_stage === 'WARM_ENGAGED')
  ).length;

  const warmEngaged = leads.filter((l) => l.funnel_stage === 'WARM_ENGAGED').length;
  const repliesNeedingTriage = leads.filter(
    (l) => l.funnel_stage === 'REPLIED_TRIAGE'
  ).length;
  const activeInterviews = leads.filter(
    (l) => l.funnel_stage === 'INTERVIEWING'
  ).length;
  const offerStage = leads.filter((l) => l.funnel_stage === 'OFFER_STAGE').length;

  const pendingApprovals = leads.filter(
    (l) =>
      l.sequence_active &&
      l.current_touch < 4 &&
      l.approval_status !== 'PAUSED' &&
      (!l.next_touch_due_at || l.next_touch_due_at <= now)
  ).length;

  return {
    total_leads: leads.length,
    active_in_sequence: activeInSequence,
    warm_engaged: warmEngaged,
    replies_needing_triage: repliesNeedingTriage,
    active_interviews: activeInterviews,
    offer_stage: offerStage,
    sent_today: sentToday,
    daily_send_limit: settings.daily_send_limit,
    pending_approvals: pendingApprovals,
    storage_engine: isSupabaseConfigured() ? 'SUPABASE' : 'LOCAL_JSON',
    email_credentials_ready: hasLiveEmailCredentials(settings),
  };
}
