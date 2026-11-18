"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, broadcastRefresh, usePoll } from "@/lib/client";
import { STAGE_META } from "@/lib/meta";
import type { Lead } from "@/lib/types";
import { fullName, relTime } from "@/lib/utils";
import { EMPTY_FILTERS, LeadFilters, Pagination } from "@/components/LeadFilters";
import { AddLeadDialog } from "@/components/pipeline/AddLeadDialog";
import { Badge, Button, Empty, Select, toast } from "@/components/ui";

export default function LeadsPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [trash, setTrash] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [sort, setSort] = useState("updated");
  const [selected, setSelected] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const qs = new URLSearchParams({ ...filters, trash: String(trash), page: String(page), pageSize: String(size), sort });
  const { data, error, loading, reload } = usePoll<{ leads: Lead[]; total: number }>(`/api/leads?${qs}`, 30_000);
  const { data: batches } = usePoll<{ batches: { id: string; name: string }[] }>("/api/imports", 0);
  useEffect(() => { const batch = new URLSearchParams(window.location.search).get("batch"); if (batch) setFilters(f => ({ ...f, batch })); }, []);
  useEffect(() => { setSelected([]); setAll(false); }, [filters, trash, page, size, sort]);
  useEffect(() => { if (data && page > 1 && (page - 1) * size >= data.total) setPage(Math.max(1, Math.ceil(data.total / size))); }, [data, page, size]);
  async function act(action: string) {
    const n = all ? data?.total ?? 0 : selected.length;
    if (["trash", "delete", "archive"].includes(action) && !confirm(`${action === "delete" ? "Permanently delete" : action === "trash" ? "Move to Trash" : "Archive"} ${n} matching lead(s)? ${action === "delete" ? "Their history will be permanently removed. This cannot be undone." : "Automated sending will stop."}`)) return;
    setBusy(true);
    try { const r = await api<{ updated: number }>("/api/leads/bulk", { method: "POST", json: { action, ids: selected, allMatching: all, filters: { ...filters, trash: String(trash) } } }); toast(`${r.updated} lead(s) updated${action === "restore" ? ". Restored leads stay paused." : ""}`); setSelected([]); setAll(false); await reload(); broadcastRefresh(); }
    catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  }
  const toggle = (id: string) => { setAll(false); setSelected(s => s.includes(id) ? s.filter(v => v !== id) : [...s, id]); };
  const disabled = busy || (!selected.length && !all);
  return <div className="mx-auto max-w-7xl space-y-4 px-5 py-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">Leads</h1><p className="mt-1 text-sm text-muted">Every contact, with search and actions across your full database.</p></div><div className="flex gap-2"><a className="rounded-md border border-line px-3 py-2 text-sm" href={`/api/leads?${qs}&export=true`}>Export matching</a><Button variant="primary" onClick={() => setAdding(true)}>Add lead</Button></div></div>
    <div className="flex gap-2"><Button variant={!trash ? "primary" : "outline"} onClick={() => { setTrash(false); setPage(1); }}>All leads</Button><Button variant={trash ? "primary" : "outline"} onClick={() => { setTrash(true); setPage(1); }}>Trash</Button></div>
    {trash && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">Trash is retained for 30 days. Restoring leaves sending paused. Blocked addresses remain blocked even after permanent deletion.</p>}
    <LeadFilters value={filters} batches={batches?.batches} onChange={f => { setFilters(f); setPage(1); }} />
    <div className="flex flex-wrap items-center gap-2"><Select aria-label="Approval filter" className="w-auto" value={filters.status} onChange={e => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}><option value="">All approval states</option>{["PENDING", "APPROVED", "PAUSED"].map(s => <option key={s}>{s}</option>)}</Select><Select aria-label="Sort leads" className="w-auto" value={sort} onChange={e => setSort(e.target.value)}><option value="updated">Recently updated</option><option value="company">Company A–Z</option><option value="created">Newest added</option><option value="due">Next touch due</option></Select><span className="ml-auto text-xs text-muted">{all ? data?.total : selected.length} selected</span>
      {selected.length > 0 && !all && <Button size="sm" onClick={() => setAll(true)}>Select all {data?.total} matching</Button>}
      {all && <Button size="sm" onClick={() => { setAll(false); setSelected([]); }}>Clear selection</Button>}
      {trash ? <><Button disabled={disabled} onClick={() => act("restore")}>Restore paused</Button><Button variant="danger" disabled={disabled} onClick={() => act("delete")}>Delete permanently</Button></> : <><Button disabled={disabled} onClick={() => act("pause")}>Pause</Button><Button disabled={disabled} onClick={() => act("unpause")}>Unpause</Button><Button disabled={disabled} onClick={() => act("archive")}>Archive</Button><Button variant="danger" disabled={disabled} onClick={() => act("trash")}>Move to Trash</Button></>}
    </div>
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    {loading && !data ? <p>Loading leads…</p> : !data?.leads.length ? <Empty title="No matching leads">Change the filters or import new contacts.</Empty> : <div className="max-h-[60dvh] overflow-auto rounded-lg border border-line"><table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-raised text-xs text-muted"><tr><th className="p-3"><input type="checkbox" aria-label="Select visible page" checked={all || data.leads.every(l => selected.includes(l.id))} onChange={e => { setAll(false); setSelected(e.target.checked ? data.leads.map(l => l.id) : []); }} /></th>{["Company / contact", "Region / track", "Stage", "Sequence", "Next step"].map(s => <th key={s} className="p-3">{s}</th>)}</tr></thead><tbody>{data.leads.map(l => <tr key={l.id} className="border-t border-line hover:bg-raised"><td className="p-3"><input type="checkbox" aria-label={`Select ${l.email}`} checked={all || selected.includes(l.id)} onChange={() => toggle(l.id)} /></td><td className="p-3"><Link className="font-medium text-sky-300 hover:underline" href={`/leads/${l.id}`}>{l.company_name}</Link><div className="text-xs text-muted">{fullName(l)} · {l.email}</div>{l.is_test && <Badge>TEST</Badge>}</td><td className="p-3 text-xs">{l.geo_region}<br />{l.role_track}</td><td className="p-3"><Badge tone={l.sub_stage === "BOUNCED" ? "rose" : l.funnel_stage === "WARM_ENGAGED" ? "amber" : "sky"}>{STAGE_META[l.funnel_stage].label}</Badge>{l.sub_stage && <div className="mt-1 text-xs text-muted">{l.sub_stage}</div>}</td><td className="p-3 text-xs">T{l.current_touch}/4 · {l.approval_status}<br />{l.sequence_active ? "Active" : "Stopped"}</td><td className="p-3 text-xs">{l.deleted_at ? `Trashed ${relTime(l.deleted_at)}` : l.next_touch_due_at ? relTime(l.next_touch_due_at) : "No scheduled send"}</td></tr>)}</tbody></table></div>}
    <Pagination page={page} pageSize={size} total={data?.total ?? 0} onPage={setPage} onSize={n => { setSize(n); setPage(1); }} />
    <AddLeadDialog open={adding} onClose={() => setAdding(false)} />
  </div>;
}
