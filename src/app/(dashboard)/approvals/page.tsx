"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, broadcastRefresh, usePoll } from "@/lib/client";
import type { ApprovalItem, ExecutionMode, SystemSettings } from "@/lib/types";
import { touchLabel } from "@/lib/meta";
import { fullName, relTime } from "@/lib/utils";
import { ApprovalCard } from "@/components/ApprovalEditor";
import { EMPTY_FILTERS, LeadFilters, Pagination } from "@/components/LeadFilters";
import { Button, Empty, toast } from "@/components/ui";

interface Response { items: ApprovalItem[]; total: number; counts: Record<string, number>; mode: ExecutionMode }
export default function ApprovalsPage() {
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, status: "PENDING" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const qs = new URLSearchParams({ ...filters, page: String(page), pageSize: String(size) });
  const { data, reload, error, loading } = usePoll<Response>(`/api/approvals?${qs}`, 30_000);
  const { data: settings } = usePoll<{ settings: SystemSettings }>("/api/settings", 0);
  const { data: batches } = usePoll<{ batches: { id: string; name: string }[] }>("/api/imports", 0);
  useEffect(() => { setSelected([]); setReview(null); }, [filters, page, size]);
  useEffect(() => { if (data && page > 1 && (page - 1) * size >= data.total) setPage(Math.max(1, Math.ceil(data.total / size))); }, [data, page, size]);
  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  async function act(action: string, allMatching = false) {
    if (allMatching && !confirm(`Approve all ${data?.total ?? 0} pending touches matching these filters, across every page?`)) return;
    setBusy(true);
    try {
      const r = await api<{ updated: number; skipped?: number }>("/api/approvals", { method: "POST", json: { action, leadIds: selected, allMatching, filters } });
      toast(`${r.updated} touch(es) updated.${r.skipped ? ` ${r.skipped} invalid draft(s) skipped; review their messages.` : ""} Sending still follows your mode, windows and daily cap.`);
      setSelected([]); await reload(); broadcastRefresh();
    } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  }
  function closeReview() { if (!dirty || confirm("Discard unsaved message edits?")) { setReview(null); setDirty(false); } }
  useEffect(() => { if (!review) return; const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && (!dirty || confirm("Discard unsaved message edits?"))) { setReview(null); setDirty(false); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [review, dirty]);
  const current = data?.items.find(i => i.lead.id === review);
  return <div className="mx-auto max-w-7xl space-y-4 px-5 py-6">
    <div><h1 className="text-xl font-semibold">Approvals</h1><p className="mt-1 text-sm text-muted">Passed addresses with touches due in the next 24 hours. <Link className="underline" href="/prechecks">Review pending or blocked email checks</Link>.</p></div>
    <div className={`rounded-lg border p-3 text-sm ${data?.mode === "AUTO_PILOT" ? "border-line bg-card text-muted" : "border-line bg-card text-muted"}`}>
      {data?.mode === "AUTO_PILOT" ? "Auto-Pilot: eligible touches send without approval. Pause a lead to hold it." : "Approval Gate: only approved touches can send."} <Link className="underline" href="/settings">Change mode</Link>. Approving does not run the queue.
    </div>
    <div className="flex flex-wrap gap-2">{[["PENDING", "Pending"], ["APPROVED", "Approved"], ["PAUSED", "Held"]].map(([s, label]) => <Button key={s} variant={filters.status === s ? "primary" : "outline"} onClick={() => { setFilters({ ...filters, status: s }); setPage(1); }}>{label} · {data?.counts[s] ?? "—"}</Button>)}</div>
    <LeadFilters value={filters} stages={false} batches={batches?.batches} onChange={f => { setFilters(f); setPage(1); }} />
    <div className="flex flex-wrap items-center gap-2"><span className="mr-auto text-xs text-muted">{selected.length} selected · {data?.total ?? 0} matching</span>
      {filters.status === "PENDING" && <><Button disabled={!selected.length || busy} onClick={() => act("approve")}>Approve selected</Button><Button variant="primary" disabled={!data?.total || busy} onClick={() => act("approve", true)}>Approve all matching</Button></>}
      {filters.status === "APPROVED" && <Button disabled={!selected.length || busy} onClick={() => act("unapprove")}>Revoke selected</Button>}
      <Button disabled={!selected.length || busy} onClick={() => act(filters.status === "PAUSED" ? "unapprove" : "pause")}>{filters.status === "PAUSED" ? "Release selected" : "Hold selected"}</Button>
    </div>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {loading && !data ? <p>Loading approvals…</p> : !data?.items.length ? <Empty title="No touches in this view">Try another status or change the filters.</Empty> : <div className="max-h-[60dvh] overflow-auto rounded-lg border border-line bg-card"><table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-raised text-xs text-muted"><tr><th className="p-3"><input aria-label="Select visible page" type="checkbox" checked={!!data.items.length && data.items.every(i => selected.includes(i.lead.id))} onChange={e => setSelected(e.target.checked ? data.items.filter(i => !i.error).map(i => i.lead.id) : [])} /></th>{["Company / contact", "Touch", "Region / track", "Due", "Message"].map(s => <th className="p-3" key={s}>{s}</th>)}</tr></thead><tbody>{data.items.map(i => <tr className="border-t border-line hover:bg-raised" key={i.lead.id}><td className="p-3"><input type="checkbox" aria-label={`Select ${i.lead.company_name}`} checked={selected.includes(i.lead.id)} disabled={!!i.error} onChange={() => toggle(i.lead.id)} /></td><td className="p-3"><Link className="font-medium text-sky-700" href={`/leads/${i.lead.id}`}>{i.lead.company_name}</Link><div className="text-xs text-muted">{fullName(i.lead)} · {i.lead.email}</div></td><td className="p-3">{touchLabel(i.touchNumber, i.variant)}</td><td className="p-3 text-xs">{i.lead.geo_region}<br />{i.lead.role_track}</td><td className="p-3 text-xs">{relTime(i.dueAt)}<br />{i.inWindow ? "In send window" : "Outside window"}</td><td className="p-3"><Button size="sm" onClick={() => setReview(i.lead.id)}>Review {i.hasDraft ? "edited draft" : "message"}</Button>{i.error && <p className="text-xs text-rose-700">{i.error}</p>}</td></tr>)}</tbody></table></div>}
    <Pagination page={page} pageSize={size} total={data?.total ?? 0} onPage={setPage} onSize={s => { setSize(s); setPage(1); }} />
    {current && <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onMouseDown={closeReview}><section role="dialog" aria-modal="true" aria-label="Review email" className="h-full w-full max-w-3xl overflow-y-auto bg-bg p-4" onMouseDown={e => e.stopPropagation()}><Button className="mb-4" onClick={closeReview}>Close review</Button><ApprovalCard key={current.lead.id} onDirty={setDirty} item={current} selected={selected.includes(current.lead.id)} onToggle={() => toggle(current.lead.id)} settings={settings?.settings ?? null} onChanged={() => { reload(); broadcastRefresh(); }} /></section></div>}
  </div>;
}
