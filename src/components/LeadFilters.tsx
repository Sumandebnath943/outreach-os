"use client";
import { FUNNEL_STAGES, GEO_REGIONS, ROLE_TRACKS } from "@/lib/types";
import { TRACK_TONE, GEO_TONE } from "@/lib/theme";
import { STAGE_META } from "@/lib/meta";
import { Input, Select, Button } from "./ui";
export type Filters = { q: string; stage: string; geo: string; track: string; batch: string; status: string };
export const EMPTY_FILTERS: Filters = { q: "", stage: "", geo: "", track: "", batch: "", status: "" };
export function LeadFilters({ value, onChange, stages = true, batches = [] }: { value: Filters; onChange: (f: Filters) => void; stages?: boolean; batches?: { id: string; name: string }[] }) {
  const set = (k: keyof Filters, v: string) => onChange({ ...value, [k]: v });
  return <div className="flex flex-wrap gap-2">
    <Input aria-label="Search leads" placeholder="Search company, person or email…" className="min-w-48 flex-1" value={value.q} onChange={e => set("q", e.target.value)} />
    {stages && <Select aria-label="Stage" className="filter-control w-auto" data-active={!!value.stage} data-stage={value.stage || undefined} value={value.stage} onChange={e => set("stage", e.target.value)}><option value="">All stages</option>{FUNNEL_STAGES.map(s => <option key={s} value={s}>{STAGE_META[s].label}</option>)}</Select>}
    <Select aria-label="Region" className="filter-control w-auto" data-active={!!value.geo} data-tone={GEO_TONE[value.geo]} value={value.geo} onChange={e => set("geo", e.target.value)}><option value="">All regions</option>{GEO_REGIONS.map(s => <option key={s}>{s}</option>)}</Select>
    <Select aria-label="Role track" className="filter-control w-auto" data-active={!!value.track} data-tone={TRACK_TONE[value.track]} value={value.track} onChange={e => set("track", e.target.value)}><option value="">All tracks</option>{ROLE_TRACKS.map(s => <option key={s}>{s}</option>)}</Select>
    {batches.length > 0 && <Select aria-label="Import batch" className="filter-control w-auto max-w-52" data-active={!!value.batch} value={value.batch} onChange={e => set("batch", e.target.value)}><option value="">All imports</option>{batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>}
  </div>;
}
export function Pagination({ page, pageSize, total, onPage, onSize, fixedSize = false }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onSize: (s: number) => void; fixedSize?: boolean }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3 text-xs text-muted">
    <span aria-live="polite">{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total.toLocaleString()}` : "0 results"}</span>
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">{fixedSize ? <span>{pageSize} / page</span> : <Select aria-label="Rows per page" className="h-7 w-32 text-xs" value={pageSize} onChange={e => onSize(Number(e.target.value))}>{[25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}</Select>}
      <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><span className="whitespace-nowrap">Page {page}</span><Button size="sm" disabled={page * pageSize >= total} onClick={() => onPage(page + 1)}>Next</Button></div>
  </div>;
}
