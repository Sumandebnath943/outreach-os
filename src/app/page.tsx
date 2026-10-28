'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Eye,
  Filter,
  Flame,
  Globe2,
  GripVertical,
  MousePointerClick,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import CommandHeader from '@/components/CommandHeader';
import LeadDossierDrawer from '@/components/LeadDossierDrawer';
import NewLeadModal from '@/components/NewLeadModal';
import {
  FUNNEL_STAGES,
  FunnelStage,
  GEO_REGION_META,
  GeoRegion,
  GlobalKPIs,
  Lead,
  ROLE_TRACK_META,
  RoleTrack,
} from '@/types/outreach';

export default function KanbanDashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [kpis, setKpis] = useState<GlobalKPIs | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [geoFilter, setGeoFilter] = useState<GeoRegion | 'ALL'>('ALL');
  const [trackFilter, setTrackFilter] = useState<RoleTrack | 'ALL'>('ALL');

  // Modals & Drawers
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);

  // Drag & Drop State
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<FunnelStage | null>(null);

  const fetchBoard = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (geoFilter !== 'ALL') params.set('geo_region', geoFilter);
      if (trackFilter !== 'ALL') params.set('role_track', trackFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/leads?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      setLeads(data.leads || []);
      setKpis(data.kpis || null);
    } finally {
      setLoading(false);
    }
  }, [geoFilter, trackFilter, search]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  const handleDropOnStage = async (targetStage: FunnelStage) => {
    setDragOverStage(null);
    if (!draggedLeadId) return;

    const lead = leads.find((l) => l.id === draggedLeadId);
    if (!lead || lead.funnel_stage === targetStage) {
      setDraggedLeadId(null);
      return;
    }

    // Optimistic UI update
    setLeads((prev) =>
      prev.map((l) =>
        l.id === draggedLeadId ? { ...l, funnel_stage: targetStage } : l
      )
    );
    setDraggedLeadId(null);

    await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lead.id, funnel_stage: targetStage }),
    });
    fetchBoard();
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#09090B]">
      <CommandHeader kpis={kpis} onRefreshData={fetchBoard} />

      {/* Sub-Header Filter & Action Bar */}
      <div className="border-b border-[#27272A] bg-[#09090B] px-4 py-3">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company, contact, role..."
                className="w-64 rounded border border-[#27272A] bg-[#121215] pl-8 pr-3 py-1.5 text-xs text-[#FAFAFA] placeholder-zinc-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>

            {/* Geo Filter */}
            <div className="flex items-center gap-1 rounded border border-[#27272A] bg-[#121215] px-2 py-1">
              <Globe2 className="h-3.5 w-3.5 text-zinc-500" />
              {(['ALL', 'INDIA', 'US', 'GLOBAL'] as const).map((geo) => (
                <button
                  key={geo}
                  onClick={() => setGeoFilter(geo)}
                  className={`rounded px-2 py-0.5 font-mono text-[11px] transition-colors ${
                    geoFilter === geo
                      ? 'bg-[#27272A] text-[#FAFAFA] font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {geo === 'ALL' ? 'ALL GEO' : geo}
                </button>
              ))}
            </div>

            {/* Role Track Filter */}
            <div className="flex items-center gap-1 rounded border border-[#27272A] bg-[#121215] px-2 py-1">
              <Filter className="h-3.5 w-3.5 text-zinc-500" />
              {(['ALL', 'HYBRID_DEFAULT', 'BRAND', 'AI_PMM', 'AI_PM'] as const).map(
                (track) => (
                  <button
                    key={track}
                    onClick={() => setTrackFilter(track)}
                    className={`rounded px-2 py-0.5 font-mono text-[11px] transition-colors ${
                      trackFilter === track
                        ? 'bg-[#27272A] text-[#FAFAFA] font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {track === 'ALL'
                      ? 'ALL TRACKS'
                      : ROLE_TRACK_META[track].shortLabel}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden md:inline font-mono text-[11px] text-zinc-500">
              Drag cards across columns or click any lead to open Dossier & Telemetry
            </span>
            <button
              onClick={() => setIsNewLeadOpen(true)}
              className="flex items-center gap-1.5 rounded bg-[#FAFAFA] px-3 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-zinc-200 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Lead</span>
            </button>
          </div>
        </div>
      </div>

      {/* 8-Stage Horizontal Kanban Pipeline */}
      <main className="flex-1 overflow-x-auto px-4 py-4">
        <div className="mx-auto flex min-w-max gap-3.5 pb-6">
          {FUNNEL_STAGES.map((stage) => {
            const stageLeads = leads.filter((l) => l.funnel_stage === stage.id);
            const isDropTarget = dragOverStage === stage.id;

            return (
              <div
                key={stage.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStage !== stage.id) {
                    setDragOverStage(stage.id);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverStage === stage.id) {
                    setDragOverStage(null);
                  }
                }}
                onDrop={() => handleDropOnStage(stage.id)}
                className={`flex w-[305px] shrink-0 flex-col rounded-lg border transition-colors ${
                  isDropTarget
                    ? 'border-emerald-500/60 bg-[#141816]'
                    : 'border-[#27272A] bg-[#0D0D10]'
                }`}
              >
                {/* Column Header */}
                <div className="border-b border-[#27272A] p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: stage.accentColor }}
                      />
                      <span className="font-mono text-[11px] text-zinc-500">
                        {stage.number}
                      </span>
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[#FAFAFA]">
                        {stage.name}
                      </h2>
                    </div>
                    <span className="rounded border border-[#27272A] bg-[#121215] px-2 py-0.5 font-mono text-xs font-semibold text-zinc-300">
                      {stageLeads.length}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-zinc-500">
                    {stage.shortDesc}
                  </p>
                </div>

                {/* Column Cards */}
                <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5 max-h-[calc(100vh-225px)]">
                  {loading ? (
                    <div className="rounded border border-[#27272A] bg-[#121215] p-4 text-center font-mono text-xs text-zinc-500">
                      Loading stage...
                    </div>
                  ) : stageLeads.length === 0 ? (
                    <div className="rounded border border-dashed border-[#27272A]/70 p-6 text-center font-mono text-[11px] text-zinc-600">
                      Drop lead here
                    </div>
                  ) : (
                    stageLeads.map((lead) => {
                      const isWarm =
                        lead.funnel_stage === 'WARM_ENGAGED' ||
                        lead.click_count > 0 ||
                        lead.portfolio_visit_count > 0 ||
                        lead.open_count >= 2;

                      return (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={() => setDraggedLeadId(lead.id)}
                          onDragEnd={() => {
                            setDraggedLeadId(null);
                            setDragOverStage(null);
                          }}
                          onClick={() => setSelectedLeadId(lead.id)}
                          className={`group cursor-pointer rounded-md border bg-[#121215] p-3 transition-all hover:bg-[#18181C] ${
                            lead.funnel_stage === 'WARM_ENGAGED'
                              ? 'border-amber-500/40 shadow-[0_0_15px_-5px_rgba(245,158,11,0.2)]'
                              : lead.funnel_stage === 'REPLIED_TRIAGE'
                              ? 'border-emerald-500/40 shadow-[0_0_15px_-5px_rgba(16,185,129,0.2)]'
                              : 'border-[#27272A] hover:border-zinc-700'
                          }`}
                        >
                          {/* Card Top Row: Company + Badges */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-600 group-hover:text-zinc-400" />
                              <span className="truncate font-mono text-xs font-bold text-[#FAFAFA]">
                                {lead.company_name}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <span
                                className={`rounded border px-1.5 py-0.2 font-mono text-[10px] font-semibold ${
                                  GEO_REGION_META[lead.geo_region]?.badgeClass
                                }`}
                              >
                                {GEO_REGION_META[lead.geo_region]?.code}
                              </span>
                              <span
                                className={`rounded border px-1.5 py-0.2 font-mono text-[10px] font-semibold ${
                                  ROLE_TRACK_META[lead.role_track]?.badgeClass
                                }`}
                              >
                                {ROLE_TRACK_META[lead.role_track]?.shortLabel}
                              </span>
                            </div>
                          </div>

                          {/* Contact Name & Job Title */}
                          <div className="mt-2">
                            <p className="text-xs font-semibold text-zinc-200">
                              {lead.first_name} {lead.last_name || ''}
                            </p>
                            <p className="truncate text-[11px] text-zinc-400">
                              {lead.job_title || lead.target_role_opening || lead.email}
                            </p>
                          </div>

                          {/* Sub-Stage or Warm Intent Banner */}
                          {lead.sub_stage && (
                            <div className="mt-2">
                              <span className="inline-block rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-300">
                                {lead.sub_stage}
                              </span>
                            </div>
                          )}

                          {/* Reply Snippet Preview */}
                          {lead.reply_snippet && (
                            <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] italic text-emerald-200 line-clamp-2">
                              &ldquo;{lead.reply_snippet}&rdquo;
                            </div>
                          )}

                          {/* Portfolio Pages Viewed Pills */}
                          {lead.portfolio_pages_viewed &&
                            lead.portfolio_pages_viewed.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {lead.portfolio_pages_viewed.slice(0, 3).map((page) => (
                                  <span
                                    key={page}
                                    className="rounded bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.2 font-mono text-[9px] text-amber-300"
                                  >
                                    {page}
                                  </span>
                                ))}
                                {lead.portfolio_pages_viewed.length > 3 && (
                                  <span className="font-mono text-[9px] text-zinc-500">
                                    +{lead.portfolio_pages_viewed.length - 3}
                                  </span>
                                )}
                              </div>
                            )}

                          {/* Card Footer: Touch Step & Telemetry Counters */}
                          <div className="mt-3 flex items-center justify-between border-t border-[#27272A]/80 pt-2 font-mono text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  lead.sequence_active
                                    ? 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                                    : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                                }`}
                              >
                                T{lead.current_touch}/4
                              </span>
                              {isWarm && (
                                <span
                                  title="High Intent / Warm Branch Active"
                                  className="flex items-center gap-0.5 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-400"
                                >
                                  <Flame className="h-2.5 w-2.5" />
                                  2A
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2.5 text-zinc-400">
                              <span
                                title="Email Opens"
                                className={`flex items-center gap-1 ${
                                  lead.open_count > 0 ? 'text-sky-400' : ''
                                }`}
                              >
                                <Eye className="h-3 w-3" />
                                {lead.open_count}
                              </span>
                              <span
                                title="Link Clicks"
                                className={`flex items-center gap-1 ${
                                  lead.click_count > 0 ? 'text-amber-400' : ''
                                }`}
                              >
                                <MousePointerClick className="h-3 w-3" />
                                {lead.click_count}
                              </span>
                              <span
                                title="Portfolio Browse Sessions"
                                className={`flex items-center gap-1 ${
                                  lead.portfolio_visit_count > 0
                                    ? 'text-emerald-400 font-bold'
                                    : ''
                                }`}
                              >
                                <Sparkles className="h-3 w-3" />
                                {lead.portfolio_visit_count}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Slide-Over Lead Dossier Drawer */}
      <LeadDossierDrawer
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        onLeadUpdated={fetchBoard}
      />

      {/* New Single Lead Modal */}
      <NewLeadModal
        isOpen={isNewLeadOpen}
        onClose={() => setIsNewLeadOpen(false)}
        onCreated={fetchBoard}
      />
    </div>
  );
}
