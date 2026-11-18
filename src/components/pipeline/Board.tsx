"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { api, broadcastRefresh, usePoll } from "@/lib/client";
import { STAGE_META } from "@/lib/meta";
import { FUNNEL_STAGES, GEO_REGIONS, ROLE_TRACKS, type FunnelStage, type Lead } from "@/lib/types";
import { cn, UUID_RE } from "@/lib/utils";
import { Button, Input, Select, toast } from "../ui";
import { AddLeadDialog } from "./AddLeadDialog";
import { LeadCard } from "./LeadCard";
import { LeadDrawer } from "./LeadDrawer";

export function Board() {
  const { data, setData, error, loading } = usePoll<{ leads: Lead[] }>("/api/leads", 20000);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [geo, setGeo] = useState("");
  const [track, setTrack] = useState("");
  const [over, setOver] = useState<FunnelStage | null>(null);

  // Deep link from Telegram alerts: /pipeline?lead=<id> opens that lead’s dossier.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("lead");
    if (id && UUID_RE.test(id)) setOpenId(id);
  }, []);

  const columns = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const leads = (data?.leads ?? []).filter(
      (l) =>
        (!geo || l.geo_region === geo) &&
        (!track || l.role_track === track) &&
        (!needle ||
          `${l.company_name} ${l.first_name} ${l.last_name ?? ""} ${l.email} ${l.job_title ?? ""}`.toLowerCase().includes(needle)),
    );
    const map = Object.fromEntries(FUNNEL_STAGES.map((s) => [s, [] as Lead[]])) as Record<FunnelStage, Lead[]>;
    for (const l of leads) map[l.funnel_stage].push(l);
    // hottest first inside each column
    for (const s of FUNNEL_STAGES)
      map[s].sort(
        (a, b) =>
          new Date(b.last_engaged_at ?? b.updated_at).getTime() - new Date(a.last_engaged_at ?? a.updated_at).getTime(),
      );
    return map;
  }, [data, q, geo, track]);

  async function move(id: string, to: FunnelStage) {
    const lead = data?.leads.find((l) => l.id === id);
    if (!lead || lead.funnel_stage === to) return;
    const prev = data!.leads;
    setData({ leads: prev.map((l) => (l.id === id ? { ...l, funnel_stage: to } : l)) });
    try {
      const res = await api<{ lead: Lead }>("/api/leads", { method: "PATCH", json: { id, funnel_stage: to } });
      setData((d) => (d ? { leads: d.leads.map((l) => (l.id === id ? res.lead : l)) } : d));
      toast(`${lead.company_name} → ${STAGE_META[to].label}`);
      broadcastRefresh();
    } catch (e) {
      setData({ leads: prev });
      toast((e as Error).message, "err");
    }
  }

  return (
    <div className="flex h-[calc(100vh-117px)] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-5 py-2.5">
        <div className="relative w-72">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-dim" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, name, email…" className="pl-8" />
        </div>
        <Select value={geo} onChange={(e) => setGeo(e.target.value)} className="w-32">
          <option value="">All geos</option>
          {GEO_REGIONS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </Select>
        <Select value={track} onChange={(e) => setTrack(e.target.value)} className="w-44">
          <option value="">All tracks</option>
          {ROLE_TRACKS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </Select>
        {error && <span className="text-xs text-rose-300">{error}</span>}
        <Button className="ml-auto" size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Add lead
        </Button>
      </div>

      <div className="flex flex-1 gap-3 overflow-x-auto px-5 py-4">
        {FUNNEL_STAGES.map((stage) => {
          const meta = STAGE_META[stage];
          const items = columns[stage];
          return (
            <section
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/lead-id");
                if (id) move(id, stage);
              }}
              className={cn(
                "flex w-[284px] shrink-0 flex-col rounded-lg border border-line bg-[#0c0c0e] transition-colors",
                over === stage && "border-zinc-500 bg-card",
              )}
            >
              <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                  <span className="font-mono text-[10px] text-dim">{meta.n}</span>
                  <span className={cn("text-xs font-medium", meta.accent)}>{meta.label}</span>
                </div>
                <span className="font-mono text-[11px] text-dim tabular">{items.length}</span>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {loading && !data && <div className="h-20 animate-pulse rounded-md bg-card" />}
                {items.map((l) => (
                  <LeadCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} />
                ))}
                {!loading && items.length === 0 && (
                  <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-[11px] text-dim">Drop here</div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {openId && <LeadDrawer leadId={openId} onClose={() => setOpenId(null)} />}
      <AddLeadDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
