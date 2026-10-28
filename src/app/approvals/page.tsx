'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  Flame,
  MousePointerClick,
  PauseCircle,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import CommandHeader from '@/components/CommandHeader';
import LeadDossierDrawer from '@/components/LeadDossierDrawer';
import {
  BranchVariant,
  GEO_REGION_META,
  GlobalKPIs,
  Lead,
  ROLE_TRACK_META,
} from '@/types/outreach';

interface ApprovalQueueItem {
  lead: Lead;
  touchNumber: 1 | 2 | 3 | 4;
  branchVariant: BranchVariant;
  branchReason: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  sameThread: boolean;
  windowStatus: {
    allowed: boolean;
    reason: string;
    localTimeStr: string;
    timezone: string;
  };
}

export default function MorningApprovalQueuePage() {
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [kpis, setKpis] = useState<GlobalKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // Inline edits keyed by lead.id
  const [edits, setEdits] = useState<
    Record<
      string,
      {
        subject: string;
        body: string;
        custom_icebreaker: string;
        isEditing: boolean;
      }
    >
  >({});

  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [batchDispatching, setBatchDispatching] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/approvals', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const loadedItems: ApprovalQueueItem[] = data.items || [];
      setItems(loadedItems);
      setKpis(data.kpis || null);

      const initialEdits: Record<
        string,
        { subject: string; body: string; custom_icebreaker: string; isEditing: boolean }
      > = {};
      for (const item of loadedItems) {
        initialEdits[item.lead.id] = {
          subject: item.subject,
          body: item.bodyText,
          custom_icebreaker: item.lead.custom_icebreaker || '',
          isEditing: false,
        };
      }
      setEdits(initialEdits);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleDispatchSingle = async (leadId: string) => {
    setDispatchingId(leadId);
    setBanner(null);
    const edit = edits[leadId];
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DISPATCH_SINGLE',
          leadId,
          subject: edit?.subject,
          body: edit?.body,
          custom_icebreaker: edit?.custom_icebreaker,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: 'error', text: data.error || 'Dispatch failed' });
        return;
      }

      if (data.haltedByReply) {
        setBanner({
          type: 'error',
          text: data.message || 'Halted: Inbound reply detected in Gmail thread!',
        });
      } else {
        setBanner({
          type: 'success',
          text: `Approved & Dispatched Touch ${data.emailLog?.touch_number} (${data.emailLog?.branch_variant}) to ${data.lead?.email} via ${data.emailLog?.provider}.`,
        });
      }
      await loadQueue();
    } finally {
      setDispatchingId(null);
    }
  };

  const handleDispatchBatch = async () => {
    if (items.length === 0 || batchDispatching) return;
    setBatchDispatching(true);
    setBanner(null);
    try {
      const batchPayload = items.map((item) => {
        const edit = edits[item.lead.id];
        return {
          leadId: item.lead.id,
          subject: edit?.subject ?? item.subject,
          body: edit?.body ?? item.bodyText,
          custom_icebreaker: edit?.custom_icebreaker ?? item.lead.custom_icebreaker,
        };
      });

      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DISPATCH_BATCH',
          items: batchPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: 'error', text: data.error || 'Batch dispatch failed' });
        return;
      }

      setBanner({
        type: 'success',
        text: `Batch Complete: Dispatched ${data.dispatchedCount} emails. ${
          data.haltedByReplyCount > 0
            ? `Halted ${data.haltedByReplyCount} due to inbound reply!`
            : ''
        }`,
      });
      await loadQueue();
    } finally {
      setBatchDispatching(false);
    }
  };

  const handlePauseLead = async (leadId: string) => {
    await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'PAUSE_LEAD',
        leadId,
      }),
    });
    await loadQueue();
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#09090B]">
      <CommandHeader kpis={kpis} onRefreshData={loadQueue} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 space-y-6">
        {/* Page Header & Batch Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#27272A] bg-[#121215] p-5">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-400" />
              <h1 className="text-base font-bold uppercase tracking-wider text-[#FAFAFA]">
                Morning Approval Queue
              </h1>
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-bold text-amber-300">
                {items.length} Due Now
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Review, customize inline subject/body or icebreakers, and dispatch due touches.
              Pre-send Gmail thread verification runs automatically before every send.
            </p>
          </div>

          <button
            onClick={handleDispatchBatch}
            disabled={items.length === 0 || batchDispatching}
            className="flex items-center gap-2 rounded bg-emerald-500 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#09090B] hover:bg-emerald-400 disabled:opacity-40 transition-colors"
          >
            <Send className="h-4 w-4" />
            <span>
              {batchDispatching
                ? 'Dispatching Batch...'
                : `Approve & Dispatch Batch (${items.length})`}
            </span>
          </button>
        </div>

        {banner && (
          <div
            className={`rounded-lg border p-4 font-mono text-xs ${
              banner.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
            }`}
          >
            {banner.text}
          </div>
        )}

        {/* Queue Cards */}
        {loading ? (
          <div className="rounded-lg border border-[#27272A] bg-[#121215] p-12 text-center font-mono text-xs text-zinc-500">
            Evaluating conditional Warm/Cold branches & rendering templates...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-[#27272A] bg-[#121215] p-12 text-center space-y-2">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <h3 className="font-mono text-sm font-bold text-[#FAFAFA]">
              Approval Queue Clear
            </h3>
            <p className="text-xs text-zinc-400">
              All due touches have been dispatched or are waiting for their +3/+5/+6 business-day cadence window.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const edit = edits[item.lead.id] || {
                subject: item.subject,
                body: item.bodyText,
                custom_icebreaker: item.lead.custom_icebreaker || '',
                isEditing: false,
              };

              const isWarmBranch = item.branchVariant === 'WARM';

              return (
                <div
                  key={item.lead.id}
                  className={`rounded-lg border bg-[#121215] p-5 transition-all ${
                    isWarmBranch
                      ? 'border-amber-500/40 shadow-[0_0_20px_-6px_rgba(245,158,11,0.2)]'
                      : 'border-[#27272A]'
                  }`}
                >
                  {/* Top Metadata Bar */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#27272A] pb-3.5">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setSelectedLeadId(item.lead.id)}
                          className="font-mono text-sm font-bold text-[#FAFAFA] hover:text-emerald-400 hover:underline"
                        >
                          {item.lead.company_name}
                        </button>
                        <span className="text-xs text-zinc-400">
                          · {item.lead.first_name} {item.lead.last_name || ''} (
                          {item.lead.email})
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                            GEO_REGION_META[item.lead.geo_region]?.badgeClass
                          }`}
                        >
                          {GEO_REGION_META[item.lead.geo_region]?.code}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                            ROLE_TRACK_META[item.lead.role_track]?.badgeClass
                          }`}
                        >
                          {ROLE_TRACK_META[item.lead.role_track]?.shortLabel}
                        </span>
                      </div>

                      {/* Conditional Branch Explanation Pill */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span
                          className={`flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] font-bold ${
                            isWarmBranch
                              ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                              : 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                          }`}
                        >
                          {isWarmBranch && <Flame className="h-3 w-3" />}
                          <span>
                            TOUCH {item.touchNumber} ({item.branchVariant})
                          </span>
                        </span>
                        <span className="font-mono text-xs text-zinc-400">
                          {item.branchReason}
                        </span>
                        {item.sameThread && (
                          <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                            RFC 2822 Same-Thread Reply
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right Telemetry & Window Info */}
                    <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                      <div className="flex items-center gap-2 rounded border border-[#27272A] bg-[#09090B] px-2.5 py-1 text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3 text-sky-400" />
                          {item.lead.open_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <MousePointerClick className="h-3 w-3 text-amber-400" />
                          {item.lead.click_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-emerald-400" />
                          {item.lead.portfolio_visit_count}
                        </span>
                      </div>

                      <div
                        className={`flex items-center gap-1 rounded border px-2.5 py-1 text-[11px] ${
                          item.windowStatus.allowed
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        <span>{item.windowStatus.localTimeStr}</span>
                      </div>
                    </div>
                  </div>

                  {/* Subject & Body Preview / Inline Editor */}
                  <div className="mt-4 space-y-3">
                    {edit.isEditing ? (
                      <div className="space-y-3 rounded border border-emerald-500/30 bg-[#09090B] p-4">
                        {item.touchNumber === 1 && (
                          <div>
                            <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                              Custom 1-Sentence Icebreaker (`{'{{custom_icebreaker}}'}`)
                            </label>
                            <input
                              type="text"
                              value={edit.custom_icebreaker}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [item.lead.id]: {
                                    ...edit,
                                    custom_icebreaker: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Optional personalized hook..."
                              className="w-full rounded border border-[#27272A] bg-[#121215] px-3 py-1.5 text-xs text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                            Rendered Subject Line
                          </label>
                          <input
                            type="text"
                            value={edit.subject}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [item.lead.id]: { ...edit, subject: e.target.value },
                              }))
                            }
                            className="w-full rounded border border-[#27272A] bg-[#121215] px-3 py-1.5 text-xs font-semibold text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                            Email Body (Tracked links & 1x1 open pixel auto-wrapped on send)
                          </label>
                          <textarea
                            rows={10}
                            value={edit.body}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [item.lead.id]: { ...edit, body: e.target.value },
                              }))
                            }
                            className="w-full rounded border border-[#27272A] bg-[#121215] p-3 font-sans text-xs leading-relaxed text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="rounded border border-[#27272A] bg-[#09090B] p-4 space-y-2">
                        <div className="flex items-center justify-between border-b border-[#27272A] pb-2">
                          <div className="text-xs">
                            <span className="font-mono text-zinc-500">Subject: </span>
                            <span className="font-semibold text-[#FAFAFA]">
                              {edit.subject}
                            </span>
                          </div>
                        </div>
                        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-300 max-h-56 overflow-y-auto">
                          {edit.body}
                        </pre>
                      </div>
                    )}

                    {/* Action Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setEdits((prev) => ({
                              ...prev,
                              [item.lead.id]: {
                                ...edit,
                                isEditing: !edit.isEditing,
                              },
                            }))
                          }
                          className="flex items-center gap-1.5 rounded border border-[#27272A] bg-[#18181C] px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-600 hover:text-white"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>
                            {edit.isEditing ? 'Done Editing' : 'Edit Subject / Body Inline'}
                          </span>
                        </button>

                        <button
                          onClick={() => handlePauseLead(item.lead.id)}
                          className="flex items-center gap-1.5 rounded border border-[#27272A] bg-[#18181C] px-3 py-1.5 text-xs text-zinc-400 hover:border-rose-500/40 hover:text-rose-300"
                        >
                          <PauseCircle className="h-3.5 w-3.5" />
                          <span>Pause Sequence</span>
                        </button>
                      </div>

                      <button
                        onClick={() => handleDispatchSingle(item.lead.id)}
                        disabled={dispatchingId === item.lead.id}
                        className="flex items-center gap-1.5 rounded bg-[#FAFAFA] px-4 py-1.5 text-xs font-bold text-[#09090B] hover:bg-zinc-200 disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>
                          {dispatchingId === item.lead.id
                            ? 'Verifying Thread & Sending...'
                            : `Approve & Dispatch Touch ${item.touchNumber}`}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <LeadDossierDrawer
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        onLeadUpdated={loadQueue}
      />
    </div>
  );
}
