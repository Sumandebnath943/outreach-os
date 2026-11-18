import { describe, expect, it, vi } from 'vitest';
import { addressProblem, addressWarnings } from '@/lib/email-check';
import { checkDomain } from '@/lib/server/email-check';
const absent = () => Promise.reject(Object.assign(new Error('absent'), { code: 'ENODATA' }));
const dns = (mx: () => Promise<{ exchange: string; priority: number }[]> = absent, a: () => Promise<string[]> = absent, aaaa: () => Promise<string[]> = absent) => ({ resolveMx: vi.fn(mx), resolve4: vi.fn(a), resolve6: vi.fn(aaaa) });
describe('free email prechecks', () => {
  it.each(['a..b@gmail.com', '.a@gmail.com', 'a.@gmail.com', 'x@-bad.com', 'x@bad-.com', 'x@foo..com', 'x@foo.invalid', 'bad', 'a'.repeat(65) + '@gmail.com', 'x\n@y.com'])('blocks unsupported or invalid syntax: %s', email => expect(addressProblem(email)).not.toBeNull());
  it('allows plus aliases and valid domain labels', () => expect(addressProblem('person+test@company-mail.co.in')).toBeNull());
  it('flags role accounts and typos without rewriting the address', () => { expect(addressWarnings('jobs@gmial.com')).toHaveLength(2); expect(addressWarnings('person@gmail.com')).toEqual([]); });
  it('passes MX without probing a mailbox', async () => { const d = dns(async () => [{ priority: 10, exchange: 'mx.company.com' }]); expect((await checkDomain('company.com', d)).status).toBe('PASSED'); expect(d.resolve4).not.toHaveBeenCalled(); });
  it.each(['.', ''])('blocks null MX %s', async exchange => { const d = dns(async () => [{ priority: 0, exchange }]); expect((await checkDomain('company.com', d)).status).toBe('BLOCKED'); expect(d.resolve4).not.toHaveBeenCalled(); });
  it('holds conflicting null MX rather than passing', async () => expect((await checkDomain('company.com', dns(async () => [{ priority: 0, exchange: '.' }, { priority: 10, exchange: 'mx.company.com' }]))).status).toBe('RETRY'));
  it('supports RFC implicit IPv4 mail routing', async () => expect((await checkDomain('company.com', dns(absent, async () => ['192.0.2.1']))).status).toBe('PASSED'));
  it('supports IPv6-only implicit mail routing', async () => expect((await checkDomain('company.com', dns(absent, absent, async () => ['2001:db8::1']))).status).toBe('PASSED'));
  it('blocks a domain without MX or A/AAAA', async () => expect((await checkDomain('company.com', dns())).status).toBe('BLOCKED'));
  it('blocks NXDOMAIN', async () => expect((await checkDomain('missing.com', dns(() => Promise.reject({ code: 'ENOTFOUND' })))).status).toBe('BLOCKED'));
  it.each(['ETIMEOUT', 'ESERVFAIL', 'ECONNREFUSED'])('holds %s for retry', async code => expect((await checkDomain('company.com', dns(() => Promise.reject({ code })))).status).toBe('RETRY'));
  it('does not mistake fallback DNS outages for a dead domain', async () => expect((await checkDomain('company.com', dns(absent, () => Promise.reject({ code: 'ETIMEOUT' })))).status).toBe('RETRY'));
});
