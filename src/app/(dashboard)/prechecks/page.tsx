"use client";
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, broadcastRefresh, usePoll } from '@/lib/client';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { STATUS_TONE } from '@/lib/theme';
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
  useEffect(() => () => { stopped.current = true; }, []);
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
  const labels: Record<string, string> = { PENDING: 'Pending', PASSED: 'Passed', BLOCKED: 'Blocked', RETRY: 'Retry scheduled' };
  return <div className="mx-auto max-w-7xl space-y-4 px-5 py-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold">Email prechecks</h1><p className="mt-1 text-sm text-muted">Check addresses before they reach approvals or outreach.</p></div><Button variant="primary" loading={busy} disabled={!data?.counts.PENDING} onClick={allPending}><ShieldCheck className="h-4 w-4" />Check all pending matching</Button></div>
    <div data-tone="info" className="tone-surface flex gap-3 rounded-lg border p-3"><ShieldCheck className="tone-text mt-0.5 h-5 w-5 shrink-0" /><div><p className="text-sm">A pass confirms domain routing, <strong>not mailbox existence</strong>.</p><details className="theme-details mt-1"><summary>How these free checks work</summary><p className="max-w-4xl text-xs leading-relaxed text-muted">Syntax, MX / fallback routing and known bounce / unsubscribe suppression are checked. Only passed addresses enter approvals or send. Scheduled runs check 50 due active contacts at a time, even at the send cap; DNS outages retry after an hour. Passed results expire after seven days. No external verification provider is connected.</p></details></div></div>
    <fieldset disabled={busy} className="space-y-4">
      <legend className="sr-only">Filter prechecks</legend>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <button aria-pressed={!check} data-tone="accent" className={`tone-surface rounded-lg border p-3 text-left ${!check ? 'tone-selected' : ''}`} onClick={() => { setCheck(''); setPage(1); }}><span className="text-xs text-muted">All addresses</span><strong className="mt-1 block text-xl tabular">{data ? Object.values(data.counts).reduce((a,b) => a+b,0) : '—'}</strong></button>
        {EMAIL_CHECK_STATUSES.map(state => <button key={state} aria-pressed={check === state} data-tone={STATUS_TONE[state]} onClick={() => { setCheck(state); setPage(1); }} className={`tone-surface rounded-lg border p-3 text-left ${check === state ? 'tone-selected' : ''}`}><span className="tone-text text-xs">{labels[state]}</span><strong className="tone-text mt-1 block text-xl tabular">{data?.counts[state] ?? '—'}</strong></button>)}
      </div>
      <LeadFilters value={filters} onChange={f => { setFilters(f); setPage(1); }} />
    </fieldset>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted">{data?.total ?? '—'} matching addresses · 25 / 50 / 100 per page</p><Button variant="info" disabled={busy || !(check ? data?.total : data?.counts.PENDING)} onClick={() => run()}><RefreshCw className="h-3.5 w-3.5" />{check ? `Recheck next 25 ${labels[check].toLowerCase()}` : 'Check next 25 pending'}</Button></div>
    {progress !== null && <div data-tone="info" className="tone-surface flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" aria-live="polite"><span className="text-sm">{progress} checked. Processing batches of 25…</span><Button onClick={() => { stopped.current = true; }}>Stop after this batch</Button></div>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {!data ? <p>Loading checks…</p> : !data.leads.length ? <Empty title="No addresses in this view">Import contacts or change the filters.</Empty> : <div className="max-h-[60dvh] overflow-auto rounded-lg border border-line bg-card"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-raised text-xs text-muted"><tr>{['Contact', 'Result', 'Explanation', 'Check schedule', ''].map((title,i) => <th key={i} className="p-3">{title}</th>)}</tr></thead><tbody>{data.leads.map(lead => <tr key={lead.id} className="border-t border-line hover:bg-raised/40"><td className="p-3"><Link href={`/leads/${lead.id}`} className="font-medium text-info hover:underline">{lead.company_name}</Link><div className="text-xs text-muted">{lead.email}</div></td><td className="p-3"><Badge tone={STATUS_TONE[lead.email_check_status || 'PENDING']}>{labels[lead.email_check_status || 'PENDING']}</Badge></td><td className="max-w-md p-3 text-xs">{lead.email_check_reason || 'Waiting for built-in checks'}{!!lead.email_check_warnings?.length && <details className="theme-details mt-2"><summary>{lead.email_check_warnings.length} warning(s)</summary>{lead.email_check_warnings.map(w => <p className="mt-1 text-muted" key={w}>{w}</p>)}</details>}</td><td className="p-3 text-xs text-muted">Checked {relTime(lead.email_checked_at)}<br />Next {relTime(lead.email_check_next_at)}</td><td className="p-3"><Button size="sm" variant="info" disabled={busy} onClick={() => run([lead.id])}>Recheck</Button></td></tr>)}</tbody></table></div>}
    <Pagination page={page} pageSize={size} total={data?.total ?? 0} onPage={setPage} onSize={n => { setSize(n); setPage(1); }} />
  </div>;
}
