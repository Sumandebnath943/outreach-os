"use client";
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, broadcastRefresh, usePoll } from '@/lib/client';
import { EMAIL_CHECK_STATUSES } from '@/lib/email-check';
import type { Lead } from '@/lib/types';
import { EMPTY_FILTERS, LeadFilters, Pagination } from '@/components/LeadFilters';
import { Badge, Button, Empty, toast } from '@/components/ui';
import { relTime } from '@/lib/utils';
interface Checks { leads: Lead[]; total: number; counts: Record<string, number> }
export default function PrechecksPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS), [check, setCheck] = useState('');
  const [page, setPage] = useState(1), [size, setSize] = useState(25), [busy, setBusy] = useState(false);
  const stopped = useRef(false);
  const [progress, setProgress] = useState<number | null>(null);
  const qs = new URLSearchParams({ ...filters, check, page: String(page), pageSize: String(size) });
  const { data, error, reload } = usePoll<Checks>(`/api/prechecks?${qs}`, 15000);
  useEffect(() => { if (data && (page - 1) * size >= data.total && page > 1) setPage(Math.max(1, Math.ceil(data.total / size))); }, [data, page, size]);
  async function run(ids?: string[]) {
    setBusy(true);
    try {
      const r = await api<{ checked: number; results: Record<string, number> }>('/api/prechecks', { method: 'POST', json: { ids, filters, check: check || 'PENDING' } });
      toast(`${r.checked} checked · ${Object.entries(r.results).map(([state, count]) => `${count} ${state.toLowerCase()}`).join(' · ')}. No mail sent.`);
      await reload(); broadcastRefresh();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function allPending() {
    stopped.current = false; setBusy(true); setProgress(0); let count = 0;
    try {
      while (!stopped.current) {
        const result = await api<{ checked: number }>('/api/prechecks', { method: 'POST', json: { filters, check: 'PENDING' } });
        count += result.checked; setProgress(count); await reload(); broadcastRefresh();
        if (result.checked < 25) break;
      }
      toast(`${count} pending addresses checked. No mail sent.`);
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); setProgress(null); }
  }
  return <div className="mx-auto max-w-7xl space-y-4 px-5 py-6">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-xl font-semibold">Email prechecks</h1><p className="mt-1 text-sm text-muted">Import → Precheck → Approval → Outreach</p></div><Button loading={busy} onClick={() => run()}>Check next 25 {check ? check.toLowerCase() : 'pending'}</Button></div>
    <div className="rounded-lg border border-line bg-card p-4 text-sm text-muted">Free checks cover address syntax, domain mail routing and known bounced/unsubscribed addresses. <strong className="text-fg">Passed does not confirm mailbox existence.</strong> Only passed addresses enter approvals or send. Scheduled runs check 50 due contacts at a time, even at the send cap; temporary DNS failures retry after an hour. Passed results expire after seven days. No verification provider is connected.</div>
    <div className="flex flex-wrap gap-2"><Button variant={!check ? 'primary' : 'outline'} onClick={() => { setCheck(''); setPage(1); }}>All</Button>{EMAIL_CHECK_STATUSES.map(state => <Button key={state} variant={check === state ? 'primary' : 'outline'} onClick={() => { setCheck(state); setPage(1); }}>{state === 'RETRY' ? 'Retry scheduled' : state} · {data?.counts[state] ?? '—'}</Button>)}</div>
    <LeadFilters value={filters} onChange={f => { setFilters(f); setPage(1); }} />
    <div className="flex flex-wrap items-center gap-3"><Button disabled={busy || !data?.counts.PENDING} onClick={allPending}>Check all pending matching</Button>{progress !== null && <><span className="text-sm text-muted">{progress} checked; processing batches of 25…</span><Button onClick={() => { stopped.current = true; }}>Stop after this batch</Button></>}</div>
    {error && <p role="alert">{error}</p>}
    {!data ? <p>Loading checks…</p> : !data.leads.length ? <Empty title="No addresses in this view">Import contacts or change the filters.</Empty> : <div className="max-h-[60dvh] overflow-auto rounded-lg border border-line bg-card"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-raised text-xs text-muted"><tr>{['Contact', 'Check result', 'Explanation', 'Checked / next check', ''].map((title, i) => <th key={i} className="p-3">{title}</th>)}</tr></thead><tbody>{data.leads.map(lead => <tr key={lead.id} className="border-t border-line"><td className="p-3"><Link href={`/leads/${lead.id}`} className="font-medium hover:underline">{lead.company_name}</Link><div className="text-xs text-muted">{lead.email}</div></td><td className="p-3"><Badge tone={lead.email_check_status === 'BLOCKED' ? 'rose' : lead.email_check_status === 'RETRY' ? 'amber' : 'neutral'}>{lead.email_check_status}</Badge></td><td className="max-w-md p-3 text-xs">{lead.email_check_reason || 'Waiting for built-in checks'}{lead.email_check_warnings?.map(w => <p className="mt-1 text-muted" key={w}>{w}</p>)}</td><td className="p-3 text-xs text-muted">{relTime(lead.email_checked_at)}<br />Next {relTime(lead.email_check_next_at)}</td><td className="p-3"><Button size="sm" disabled={busy} onClick={() => run([lead.id])}>Recheck</Button></td></tr>)}</tbody></table></div>}
    <Pagination page={page} pageSize={size} total={data?.total ?? 0} onPage={setPage} onSize={n => { setSize(n); setPage(1); }} />
  </div>;
}
