import { must } from '@/lib/server/db';
import { filtersFrom, leadQuery, pagination } from '@/lib/server/lead-query';
import { checkLeadEmail } from '@/lib/server/email-check';
import { EMAIL_CHECK_STATUSES } from '@/lib/email-check';
import { fail, ok, readJson, route } from '@/lib/server/http';
import type { Lead } from '@/lib/types';
import { UUID_RE } from '@/lib/utils';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const filters = filtersFrom(sp);
  const status = sp.get('check') || '';
  if (status && !(EMAIL_CHECK_STATUSES as readonly string[]).includes(status)) return fail('Invalid check state');
  const p = pagination(sp);
  let q = leadQuery(filters);
  if (status) q = q.eq('email_check_status', status);
  const rows = await q.order('email_check_next_at').order('id').range(p.from, p.to);
  const counts = Object.fromEntries(await Promise.all(EMAIL_CHECK_STATUSES.map(async state => {
    const result = await leadQuery(filters, 'id').eq('email_check_status', state).range(0, 0);
    must(result, 'count prechecks'); return [state, result.count ?? 0];
  })));
  return ok({ leads: must(rows, 'list prechecks'), total: rows.count ?? 0, counts, page: p.page, pageSize: p.pageSize });
});

/** Bounded rechecks never send mail or approve a touch. Repeat to drain a large pending list. */
export const POST = route(async (req: Request) => {
  const body = await readJson<{ ids?: string[]; filters?: Record<string, string>; check?: string }>(req);
  const filters = filtersFrom(new URLSearchParams(body.filters));
  if (body.check && !(EMAIL_CHECK_STATUSES as readonly string[]).includes(body.check)) return fail('Invalid check state');
  let q = leadQuery(filters);
  if (body.ids) {
    if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 25 || body.ids.some(id => !UUID_RE.test(id))) return fail('Select 1–25 valid leads');
    q = q.in('id', body.ids);
  } else q = q.eq('email_check_status', body.check || 'PENDING');
  const leads = must(await q.order('email_check_next_at').order('id').limit(25), 'load rechecks') as unknown as Lead[];
  const results: Record<string, number> = {};
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(6, leads.length) }, async () => {
    while (cursor < leads.length) { const result = await checkLeadEmail(leads[cursor++], true); results[result.status] = (results[result.status] || 0) + 1; }
  }));
  return ok({ checked: leads.length, results });
});
