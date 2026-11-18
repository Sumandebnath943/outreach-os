"use client";
import { useEffect, useState } from "react";
import { api, broadcastRefresh, usePoll } from "@/lib/client";
import { STAGE_META } from "@/lib/meta";
import { FUNNEL_STAGES, type FunnelStage, type Lead } from "@/lib/types";
import { UUID_RE } from "@/lib/utils";
import { EMPTY_FILTERS, LeadFilters, type Filters } from "../LeadFilters";
import { Button, toast } from "../ui";
import { LeadCard } from "./LeadCard";
import { LeadDrawer } from "./LeadDrawer";
import { AddLeadDialog } from "./AddLeadDialog";

function Column({ stage, filters, open }: { stage: FunnelStage; filters: Filters; open: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const [over, setOver] = useState(false);
  const qs = new URLSearchParams({ ...filters, stage, page: String(page), pageSize: "25" });
  const { data, error } = usePoll<{ leads: Lead[]; total: number }>(`/api/leads?${qs}`, 20_000);
  useEffect(() => setPage(1), [filters]);
  useEffect(() => { if (data && page > 1 && (page - 1) * 25 >= data.total) setPage(Math.max(1, Math.ceil(data.total / 25))); }, [data, page]);
  async function drop(id: string) {
    if (!UUID_RE.test(id)) return;
    try { await api("/api/leads", { method: "PATCH", json: { id, funnel_stage: stage } }); broadcastRefresh(); }
    catch (e) { toast((e as Error).message, "err"); }
  }
  const meta = STAGE_META[stage];
  return <section data-stage={stage} aria-label={meta.label} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); drop(e.dataTransfer.getData("text/lead-id")); }} className={`stage-panel flex w-[284px] shrink-0 flex-col rounded-lg border bg-card ${over ? "border-accent" : "border-line"}`}>
    <header className="flex items-center gap-2 border-b border-line px-3 py-3"><span className={`h-2 w-2 rounded-full ${meta.dot}`} /><span className={`text-xs font-medium ${meta.accent}`}>{meta.n} · {meta.label}</span><span className="ml-auto text-xs text-muted">{data?.total ?? "—"}</span></header>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">{error && <p role="alert" className="p-2 text-xs text-danger">{error}</p>}{!data && !error && <p className="p-3 text-xs text-muted">Loading…</p>}{data?.leads.map(l => <LeadCard key={l.id} lead={l} onOpen={() => open(l.id)} />)}{data?.total === 0 && <p className="p-5 text-center text-xs text-dim">Drop a lead here</p>}</div>
    <footer className="flex items-center justify-between gap-1 border-t border-line p-2"><Button size="sm" disabled={page === 1} aria-label={`Previous ${meta.label} page`} onClick={() => setPage(p => p - 1)}>←</Button><span className="text-[11px] text-muted">{data?.total ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, data.total)} of ${data.total}` : "0 leads"}</span><Button size="sm" disabled={page * 25 >= (data?.total ?? 0)} aria-label={`Next ${meta.label} page`} onClick={() => setPage(p => p + 1)}>→</Button></footer>
  </section>;
}
export function Board() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => { const id = new URLSearchParams(window.location.search).get("lead"); if (id && UUID_RE.test(id)) setOpen(id); }, []);
  return <div className="flex h-[calc(100dvh-290px)] md:h-[calc(100dvh-170px)] min-h-[420px] flex-col">
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3"><div className="flex-1"><LeadFilters value={filters} onChange={setFilters} stages={false} /></div><Button variant="primary" onClick={() => setAdding(true)}>Add lead</Button></div>
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-5 py-4">{FUNNEL_STAGES.map(stage => <Column key={stage} stage={stage} filters={filters} open={setOpen} />)}</div>
    {open && <LeadDrawer key={open} leadId={open} onClose={() => setOpen(null)} />}<AddLeadDialog open={adding} onClose={() => setAdding(false)} />
  </div>;
}
