'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  ExternalLink,
  Eye,
  FileText,
  Flame,
  Globe,
  Linkedin,
  Mail,
  MessageSquare,
  MousePointerClick,
  PauseCircle,
  PlayCircle,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  BranchVariant,
  EmailLog,
  FUNNEL_STAGES,
  FunnelStage,
  GEO_REGION_META,
  GeoRegion,
  Lead,
  ROLE_TRACK_META,
  RoleTrack,
  SubStage,
  TrackingEvent,
} from '@/types/outreach';

interface NextTouchPreview {
  touchNumber: number;
  branchVariant: BranchVariant;
  reason: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  sameThread: boolean;
}

interface LeadDossierDrawerProps {
  leadId: string | null;
  onClose: () => void;
  onLeadUpdated: () => void;
}

const SUB_STAGES: { value: NonNullable<SubStage>; label: string; group: string }[] = [
  { value: 'HR_SCREEN', label: 'HR Screen', group: 'INTERVIEWING' },
  { value: 'HIRING_MANAGER', label: 'Hiring Manager Round', group: 'INTERVIEWING' },
  { value: 'CASE_STUDY', label: 'Case Study / Live Walkthrough', group: 'INTERVIEWING' },
  { value: 'FINAL_ROUND', label: 'Final / Founder Round', group: 'INTERVIEWING' },
  { value: 'BOUNCED', label: 'Hard Bounced', group: 'CLOSED_ARCHIVE' },
  { value: 'GHOSTED', label: 'Ghosted (4 Touches Done)', group: 'CLOSED_ARCHIVE' },
  { value: 'REJECTED', label: 'Rejected / Closed', group: 'CLOSED_ARCHIVE' },
];

export default function LeadDossierDrawer({
  leadId,
  onClose,
  onLeadUpdated,
}: LeadDossierDrawerProps) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
  const [nextTouchPreview, setNextTouchPreview] = useState<NextTouchPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'THREAD' | 'TELEMETRY' | 'NOTES'>('THREAD');

  // Editable fields
  const [icebreaker, setIcebreaker] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const loadDossier = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setLead(data.lead);
      setEmailLogs(data.emailLogs || []);
      setTrackingEvents(data.trackingEvents || []);
      setNextTouchPreview(data.nextTouchPreview || null);
      setIcebreaker(data.lead?.custom_icebreaker || '');
      setTargetRole(data.lead?.target_role_opening || '');
      setNotes(data.lead?.notes || '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (leadId) {
      loadDossier(leadId);
      setStatusBanner(null);
    } else {
      setLead(null);
    }
  }, [leadId, loadDossier]);

  if (!leadId) return null;

  const handlePatchLead = async (patch: Partial<Lead>) => {
    if (!lead) return;
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      await loadDossier(lead.id);
      onLeadUpdated();
    }
  };

  const handleSaveNotes = async () => {
    if (!lead) return;
    setSavingNotes(true);
    try {
      await handlePatchLead({
        custom_icebreaker: icebreaker,
        target_role_opening: targetRole,
        notes,
      });
      setStatusBanner('Dossier notes & icebreaker saved.');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDispatchNow = async () => {
    if (!lead || dispatching) return;
    setDispatching(true);
    setStatusBanner(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DISPATCH_NEXT_TOUCH',
          custom_icebreaker: icebreaker,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusBanner(`Error: ${data.error || 'Dispatch failed'}`);
      } else {
        setStatusBanner(
          `Touch ${data.emailLog?.touch_number} (${data.emailLog?.branch_variant}) dispatched via ${data.emailLog?.provider}!`
        );
        await loadDossier(lead.id);
        onLeadUpdated();
      }
    } finally {
      setDispatching(false);
    }
  };

  const handleSimulateTelemetry = async (
    eventType: 'EMAIL_OPEN' | 'LINK_CLICK' | 'PORTFOLIO_VIEW' | 'REPLY_RECEIVED',
    extra?: Record<string, unknown>
  ) => {
    if (!lead || simulating) return;
    setSimulating(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SIMULATE_EVENT',
          eventType,
          ...extra,
        }),
      });
      if (res.ok) {
        setStatusBanner(`Simulated ${eventType} — Funnel & Sequencer state updated.`);
        await loadDossier(lead.id);
        onLeadUpdated();
      }
    } finally {
      setSimulating(false);
    }
  };

  const handleDeleteLead = async () => {
    if (!lead) return;
    if (!window.confirm(`Delete ${lead.first_name} (${lead.company_name}) permanently?`)) return;
    const res = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
    if (res.ok) {
      onLeadUpdated();
      onClose();
    }
  };

  const trackedPortfolioDirect = lead
    ? `https://sumandebnath.houseofnamus.com/?ref=${lead.id}`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="relative flex h-full w-full max-w-2xl flex-col border-l border-[#27272A] bg-[#09090B] shadow-2xl">
        {/* Top Drawer Header */}
        <div className="flex items-start justify-between border-b border-[#27272A] bg-[#121215] px-6 py-4">
          {loading && !lead ? (
            <div className="font-mono text-xs text-zinc-400">Loading Lead Dossier...</div>
          ) : lead ? (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-emerald-400">
                  {lead.company_name}
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                    GEO_REGION_META[lead.geo_region]?.badgeClass
                  }`}
                >
                  {GEO_REGION_META[lead.geo_region]?.code}
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                    ROLE_TRACK_META[lead.role_track]?.badgeClass
                  }`}
                >
                  {ROLE_TRACK_META[lead.role_track]?.shortLabel}
                </span>
                <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                  TOUCH {lead.current_touch}/4
                </span>
              </div>

              <h2 className="text-lg font-bold text-[#FAFAFA]">
                {lead.first_name} {lead.last_name || ''}
                {lead.job_title && (
                  <span className="ml-2 text-sm font-normal text-zinc-400">
                    · {lead.job_title}
                  </span>
                )}
              </h2>

              <div className="flex flex-wrap items-center gap-3 pt-1 font-mono text-xs text-zinc-400">
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-1 hover:text-[#FAFAFA]"
                >
                  <Mail className="h-3.5 w-3.5 text-zinc-500" />
                  <span>{lead.email}</span>
                </a>
                {lead.linkedin_url && (
                  <a
                    href={lead.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sky-400 hover:underline"
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                    <span>LinkedIn</span>
                  </a>
                )}
                {lead.company_website && (
                  <a
                    href={lead.company_website}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-zinc-300 hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Website</span>
                  </a>
                )}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            {lead && (
              <button
                onClick={handleDeleteLead}
                title="Delete Lead"
                className="rounded border border-rose-500/30 bg-rose-500/10 p-1.5 text-rose-400 hover:bg-rose-500/20"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded border border-[#27272A] bg-[#18181C] p-1.5 text-zinc-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {statusBanner && (
          <div className="border-b border-emerald-500/30 bg-emerald-500/10 px-6 py-2 font-mono text-xs text-emerald-300">
            {statusBanner}
          </div>
        )}

        {lead && (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Stage, Sub-Stage, Role Track & Sequence Controls */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-lg border border-[#27272A] bg-[#121215] p-3">
              <div>
                <label className="block font-mono text-[10px] uppercase text-zinc-500 mb-1">
                  Funnel Stage
                </label>
                <select
                  value={lead.funnel_stage}
                  onChange={(e) =>
                    handlePatchLead({ funnel_stage: e.target.value as FunnelStage })
                  }
                  className="w-full rounded border border-[#27272A] bg-[#09090B] px-2 py-1.5 text-xs text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                >
                  {FUNNEL_STAGES.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.number}. {st.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-zinc-500 mb-1">
                  Sub-Stage
                </label>
                <select
                  value={lead.sub_stage || ''}
                  onChange={(e) =>
                    handlePatchLead({
                      sub_stage: (e.target.value || null) as SubStage,
                    })
                  }
                  className="w-full rounded border border-[#27272A] bg-[#09090B] px-2 py-1.5 text-xs text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">None</option>
                  {SUB_STAGES.map((ss) => (
                    <option key={ss.value} value={ss.value}>
                      {ss.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-zinc-500 mb-1">
                  Role Track
                </label>
                <select
                  value={lead.role_track}
                  onChange={(e) =>
                    handlePatchLead({ role_track: e.target.value as RoleTrack })
                  }
                  className="w-full rounded border border-[#27272A] bg-[#09090B] px-2 py-1.5 text-xs text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                >
                  <option value="HYBRID_DEFAULT">HYBRID (Default)</option>
                  <option value="BRAND">BRAND</option>
                  <option value="AI_PMM">AI_PMM</option>
                  <option value="AI_PM">AI_PM</option>
                </select>
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-zinc-500 mb-1">
                  Geo / Timezone
                </label>
                <select
                  value={lead.geo_region}
                  onChange={(e) =>
                    handlePatchLead({ geo_region: e.target.value as GeoRegion })
                  }
                  className="w-full rounded border border-[#27272A] bg-[#09090B] px-2 py-1.5 text-xs text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                >
                  <option value="INDIA">INDIA (IST)</option>
                  <option value="US">US (EST)</option>
                  <option value="GLOBAL">GLOBAL (UTC)</option>
                </select>
              </div>
            </div>

            {/* Three-Layer Intent Telemetry Strip */}
            <div className="rounded-lg border border-[#27272A] bg-[#121215] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  3-Layer Intent Telemetry
                </span>
                <button
                  onClick={() =>
                    handlePatchLead({
                      sequence_active: !lead.sequence_active,
                      approval_status: !lead.sequence_active ? 'PENDING' : 'PAUSED',
                    })
                  }
                  className={`flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] ${
                    lead.sequence_active
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {lead.sequence_active ? (
                    <>
                      <PlayCircle className="h-3 w-3" />
                      <span>SEQ ACTIVE</span>
                    </>
                  ) : (
                    <>
                      <PauseCircle className="h-3 w-3" />
                      <span>SEQ PAUSED</span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded border border-[#27272A] bg-[#09090B] p-2.5">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-[11px]">Email Opens</span>
                    <Eye className="h-3.5 w-3.5 text-sky-400" />
                  </div>
                  <p className="mt-1 font-mono text-lg font-bold text-[#FAFAFA]">
                    {lead.open_count}
                  </p>
                </div>

                <div className="rounded border border-[#27272A] bg-[#09090B] p-2.5">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-[11px]">Link Clicks</span>
                    <MousePointerClick className="h-3.5 w-3.5 text-amber-400" />
                  </div>
                  <p className="mt-1 font-mono text-lg font-bold text-amber-400">
                    {lead.click_count}
                  </p>
                </div>

                <div className="rounded border border-[#27272A] bg-[#09090B] p-2.5">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-[11px]">Portfolio Visits</span>
                    <Flame className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <p className="mt-1 font-mono text-lg font-bold text-emerald-400">
                    {lead.portfolio_visit_count}
                  </p>
                </div>
              </div>

              {/* Visited Portfolio Routes */}
              {lead.portfolio_pages_viewed && lead.portfolio_pages_viewed.length > 0 && (
                <div>
                  <span className="block font-mono text-[10px] uppercase text-zinc-500 mb-1.5">
                    Portfolio Pages Viewed by {lead.first_name}:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {lead.portfolio_pages_viewed.map((route) => (
                      <span
                        key={route}
                        className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-300"
                      >
                        {route}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Tracked Portfolio Ref Link */}
              <div className="flex items-center justify-between rounded border border-[#27272A] bg-[#09090B] px-3 py-1.5 font-mono text-[11px]">
                <span className="truncate text-zinc-400">{trackedPortfolioDirect}</span>
                <a
                  href={trackedPortfolioDirect}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 flex items-center gap-1 text-emerald-400 hover:underline shrink-0"
                >
                  <span>Open</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {/* Interactive Telemetry Simulator */}
              <div className="pt-1 border-t border-[#27272A]">
                <span className="block font-mono text-[10px] uppercase text-zinc-500 mb-1.5">
                  Simulate Live Recruiter Action (Test State Machine & Warm Branching):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => handleSimulateTelemetry('EMAIL_OPEN')}
                    disabled={simulating}
                    className="rounded border border-[#27272A] bg-[#18181C] px-2.5 py-1 font-mono text-[11px] text-zinc-300 hover:border-sky-500/50 hover:text-sky-300"
                  >
                    +1 Email Open
                  </button>
                  <button
                    onClick={() => handleSimulateTelemetry('LINK_CLICK')}
                    disabled={simulating}
                    className="rounded border border-[#27272A] bg-[#18181C] px-2.5 py-1 font-mono text-[11px] text-zinc-300 hover:border-amber-500/50 hover:text-amber-300"
                  >
                    +1 Portfolio Click (Warm)
                  </button>
                  <button
                    onClick={() =>
                      handleSimulateTelemetry('PORTFOLIO_VIEW', {
                        path: '/agents/migi',
                        durationSec: 84,
                      })
                    }
                    disabled={simulating}
                    className="rounded border border-[#27272A] bg-[#18181C] px-2.5 py-1 font-mono text-[11px] text-zinc-300 hover:border-amber-500/50 hover:text-amber-300"
                  >
                    Viewed /agents/migi (84s)
                  </button>
                  <button
                    onClick={() => handleSimulateTelemetry('REPLY_RECEIVED')}
                    disabled={simulating}
                    className="rounded border border-[#27272A] bg-[#18181C] px-2.5 py-1 font-mono text-[11px] text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300"
                  >
                    Simulate Inbound Reply (Kill-Switch)
                  </button>
                </div>
              </div>
            </div>

            {/* Inbound Reply Snippet Alert */}
            {lead.reply_snippet && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3.5">
                <div className="flex items-center justify-between font-mono text-[11px] font-bold text-emerald-400">
                  <span>INBOUND REPLY DETECTED (SEQUENCE HALTED)</span>
                  {lead.replied_at && (
                    <span>{new Date(lead.replied_at).toLocaleString()}</span>
                  )}
                </div>
                <p className="mt-1.5 text-xs italic text-emerald-100">
                  &ldquo;{lead.reply_snippet}&rdquo;
                </p>
              </div>
            )}

            {/* Dossier Navigation Tabs */}
            <div className="flex border-b border-[#27272A]">
              <button
                onClick={() => setActiveTab('THREAD')}
                className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
                  activeTab === 'THREAD'
                    ? 'border-emerald-400 text-[#FAFAFA]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Sent Thread & Next Touch ({emailLogs.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('TELEMETRY')}
                className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
                  activeTab === 'TELEMETRY'
                    ? 'border-emerald-400 text-[#FAFAFA]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                <span>Telemetry Feed ({trackingEvents.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('NOTES')}
                className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
                  activeTab === 'NOTES'
                    ? 'border-emerald-400 text-[#FAFAFA]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Icebreaker & Prep Notes</span>
              </button>
            </div>

            {/* TAB 1: EMAIL THREAD & NEXT TOUCH */}
            {activeTab === 'THREAD' && (
              <div className="space-y-4">
                {/* Sent History */}
                {emailLogs.length === 0 ? (
                  <div className="rounded border border-dashed border-[#27272A] p-4 text-center font-mono text-xs text-zinc-500">
                    No touches dispatched yet (Currently at Touch 0).
                  </div>
                ) : (
                  <div className="space-y-3">
                    {emailLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-lg border border-[#27272A] bg-[#121215] p-3.5 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#27272A] pb-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                              TOUCH {log.touch_number} ({log.branch_variant})
                            </span>
                            <span className="font-mono text-[10px] text-zinc-400">
                              via {log.provider}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-zinc-500">
                            {new Date(log.sent_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[#FAFAFA]">
                          {log.subject}
                        </p>
                        {log.rfc_message_id && (
                          <p className="font-mono text-[10px] text-zinc-500 truncate">
                            RFC Message-ID: {log.rfc_message_id} · Thread:{' '}
                            {log.gmail_thread_id || 'N/A'}
                          </p>
                        )}
                        <div
                          className="rounded border border-[#27272A] bg-[#09090B] p-3 text-xs text-zinc-300 overflow-x-auto"
                          dangerouslySetInnerHTML={{ __html: log.body_html }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Upcoming Next Touch Preview */}
                {nextTouchPreview && (
                  <div className="rounded-lg border border-amber-500/30 bg-[#121215] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                          <span className="font-mono text-xs font-bold uppercase text-amber-300">
                            Next Scheduled: Touch {nextTouchPreview.touchNumber} (
                            {nextTouchPreview.branchVariant})
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-zinc-400 mt-0.5">
                          {nextTouchPreview.reason}
                        </p>
                      </div>

                      <button
                        onClick={handleDispatchNow}
                        disabled={dispatching}
                        className="flex items-center gap-1.5 rounded bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-emerald-400 disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>
                          {dispatching
                            ? 'Dispatching...'
                            : `Dispatch Touch ${nextTouchPreview.touchNumber} Now`}
                        </span>
                      </button>
                    </div>

                    <div className="rounded border border-[#27272A] bg-[#09090B] p-3 space-y-2">
                      <div className="border-b border-[#27272A] pb-1.5 text-xs">
                        <span className="font-mono text-zinc-500">Subject: </span>
                        <span className="font-medium text-[#FAFAFA]">
                          {nextTouchPreview.subject}
                        </span>
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-300">
                        {nextTouchPreview.bodyText}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: TELEMETRY EVENT STREAM */}
            {activeTab === 'TELEMETRY' && (
              <div className="space-y-2.5">
                {trackingEvents.length === 0 ? (
                  <div className="rounded border border-dashed border-[#27272A] p-6 text-center font-mono text-xs text-zinc-500">
                    No engagement events recorded yet.
                  </div>
                ) : (
                  trackingEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-start justify-between gap-3 rounded border border-[#27272A] bg-[#121215] p-3 font-mono text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              ev.event_type === 'PORTFOLIO_VIEW'
                                ? 'bg-amber-500/20 text-amber-300'
                                : ev.event_type === 'LINK_CLICK'
                                ? 'bg-sky-500/20 text-sky-300'
                                : ev.event_type === 'REPLY_RECEIVED'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-zinc-800 text-zinc-300'
                            }`}
                          >
                            {ev.event_type}
                          </span>
                          {ev.event_type === 'PORTFOLIO_VIEW' && (
                            <span className="text-[#FAFAFA]">
                              Viewed{' '}
                              <strong className="text-amber-300">
                                {String(ev.metadata?.path || '/')}
                              </strong>{' '}
                              for {String(ev.metadata?.durationSec || 0)}s
                            </span>
                          )}
                          {ev.event_type === 'LINK_CLICK' && (
                            <span className="text-zinc-300">
                              Clicked tracked {String(ev.metadata?.linkType || 'portfolio')} link
                            </span>
                          )}
                          {ev.event_type === 'EMAIL_OPEN' && (
                            <span className="text-zinc-300">
                              Opened email (Open #{String(ev.metadata?.open_count || 1)})
                            </span>
                          )}
                          {ev.event_type === 'STAGE_CHANGE' && (
                            <span className="text-zinc-300">
                              {String(ev.metadata?.from_stage)} →{' '}
                              <strong className="text-emerald-400">
                                {String(ev.metadata?.to_stage)}
                              </strong>
                            </span>
                          )}
                          {ev.event_type === 'REPLY_RECEIVED' && (
                            <span className="text-emerald-300">
                              {String(ev.metadata?.snippet || 'Reply received')}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-zinc-500 shrink-0">
                        {new Date(ev.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 3: ICEBREAKER & PREP NOTES */}
            {activeTab === 'NOTES' && (
              <div className="space-y-4">
                <div>
                  <label className="block font-mono text-xs uppercase text-zinc-400 mb-1">
                    Target Role Opening (`{'{{target_role_opening}}'}`)
                  </label>
                  <input
                    type="text"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="e.g. Senior Brand Marketing Manager / AI PMM"
                    className="w-full rounded border border-[#27272A] bg-[#121215] px-3 py-2 text-xs text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-mono text-xs uppercase text-zinc-400 mb-1">
                    Custom 1-Sentence Icebreaker (`{'{{custom_icebreaker}}'}`)
                  </label>
                  <textarea
                    rows={3}
                    value={icebreaker}
                    onChange={(e) => setIcebreaker(e.target.value)}
                    placeholder="Optional personalized hook; collapses cleanly with zero extra line breaks if left blank."
                    className="w-full rounded border border-[#27272A] bg-[#121215] p-3 text-xs text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-mono text-xs uppercase text-zinc-400 mb-1">
                    Interview Prep, Compensation & Dossier Notes
                  </label>
                  <textarea
                    rows={6}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Store hiring manager notes, case study links, compensation structure, or notice period buyout notes..."
                    className="w-full rounded border border-[#27272A] bg-[#121215] p-3 text-xs text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="rounded bg-[#FAFAFA] px-4 py-2 text-xs font-semibold text-[#09090B] hover:bg-zinc-200 disabled:opacity-50"
                >
                  {savingNotes ? 'Saving...' : 'Save Dossier Changes'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
