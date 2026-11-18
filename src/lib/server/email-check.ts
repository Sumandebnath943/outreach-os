import 'server-only';
import { Resolver } from 'node:dns/promises';
import { addressProblem, addressWarnings, type EmailCheckResult } from '../email-check';
import type { Lead } from '../types';
import { db, must } from './db';
import { suppression } from './lead-query';

interface Dns { resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>; resolve4(domain: string): Promise<string[]>; resolve6(domain: string): Promise<string[]> }
const cache = new Map<string, { expires: number; result: Promise<EmailCheckResult> }>();
const code = (error: unknown) => (error as { code?: string }).code;
const missing = (error: unknown) => ['ENODATA', 'ENOTFOUND'].includes(code(error) || '');

/** RFC 5321 implicit A/AAAA fallback, and RFC 7505 explicit null MX. No SMTP probing. */
export async function checkDomain(domain: string, dns: Dns = new Resolver({ timeout: 1500, tries: 1 })): Promise<EmailCheckResult> {
  const result = (status: EmailCheckResult['status'], reason: string): EmailCheckResult => ({ status, reason, warnings: [] });
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.some(r => r.exchange === '.' || r.exchange === '')) {
      return mx.length === 1 && mx[0].priority === 0 ? result('BLOCKED', 'Domain explicitly accepts no email (null MX)') : result('RETRY', 'Conflicting mail routing records; recheck required');
    }
    if (mx.length) return result('PASSED', 'Domain has mail routing. Mailbox existence is unverified.');
  } catch (error) {
    if (code(error) === 'ENOTFOUND') return result('BLOCKED', 'Email domain does not exist (NXDOMAIN)');
    if (code(error) !== 'ENODATA') return result('RETRY', 'DNS temporarily unavailable; sending held for retry');
  }
  const fallback = await Promise.allSettled([dns.resolve4(domain), dns.resolve6(domain)]);
  if (fallback.some(r => r.status === 'fulfilled' && r.value.length)) return result('PASSED', 'Domain accepts implicit mail routing (A/AAAA). Mailbox existence is unverified.');
  if (fallback.some(r => r.status === 'rejected' && !missing(r.reason))) return result('RETRY', 'DNS temporarily unavailable; sending held for retry');
  return result('BLOCKED', 'Domain has no MX or fallback A/AAAA mail route');
}

export async function checkAddress(email: string, fresh = false): Promise<EmailCheckResult> {
  const problem = addressProblem(email);
  if (problem) return { status: 'BLOCKED', reason: problem, warnings: [] };
  const blocked = await suppression(email);
  if (blocked) return { status: 'BLOCKED', reason: `Suppressed: ${blocked}`, warnings: [] };
  const domain = email.split('@')[1].toLowerCase();
  let entry = cache.get(domain);
  if (fresh || !entry || entry.expires <= Date.now()) {
    if (cache.size > 5000) cache.clear();
    entry = { expires: Date.now() + 60_000, result: checkDomain(domain) };
    cache.set(domain, entry);
  }
  const result = await entry.result;
  if (result.status !== 'RETRY') entry.expires = Date.now() + 3_600_000;
  const warnings = addressWarnings(email);
  // Typo domains can have an MX controlled by somebody else. Require the user to correct/review.
  if (warnings.some(w => w.startsWith('Possible domain typo'))) return { status: 'BLOCKED', reason: 'Possible misspelled email domain; review the address', warnings };
  return { ...result, warnings };
}

export async function checkLeadEmail(lead: Lead, fresh = false): Promise<EmailCheckResult> {
  const result = await checkAddress(lead.email, fresh);
  const now = Date.now();
  must(await db().from('leads').update({ email_check_status: result.status, email_check_reason: result.reason, email_check_warnings: result.warnings,
    email_checked_at: new Date(now).toISOString(), email_check_next_at: new Date(now + (result.status === 'PASSED' ? 7 * 86400_000 : result.status === 'RETRY' ? 3600_000 : 86400_000)).toISOString(),
  }).eq('id', lead.id).eq('email', lead.email).is('deleted_at', null).select('id'), 'save email precheck');
  return result;
}

/** Bounded batches run before the send cap and windows; repeated cron runs drain large imports. */
export async function processEmailChecks(limit = 50): Promise<number> {
  const leads = must(await db().from('leads').select('*').is('deleted_at', null).eq('sequence_active', true)
    .lte('email_check_next_at', new Date().toISOString()).order('email_check_next_at').order('id').limit(limit), 'load email prechecks') as Lead[];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(6, leads.length) }, async () => {
    while (cursor < leads.length) await checkLeadEmail(leads[cursor++]);
  }));
  return leads.length;
}
