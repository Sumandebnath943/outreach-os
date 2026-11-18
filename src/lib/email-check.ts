export const EMAIL_CHECK_STATUSES = ['PENDING', 'PASSED', 'BLOCKED', 'RETRY'] as const;
export type EmailCheckStatus = (typeof EMAIL_CHECK_STATUSES)[number];
export interface EmailCheckResult { status: EmailCheckStatus; reason: string; warnings: string[] }

/** Our sender supports ASCII dot-atom addresses, not SMTPUTF8 or quoted local parts. */
export function addressProblem(email: string): string | null {
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+$/i.test(email)) return 'Unsupported or invalid email syntax';
  const [local, domain] = email.split('@');
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return 'Invalid mailbox name';
  if (!domain.includes('.') || domain.length > 253 || domain.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return 'Invalid email domain';
  if (/\.(invalid|test|localhost|example)$/i.test(domain) || domain === 'localhost') return 'Reserved domain cannot receive outreach';
  return null;
}

export function addressWarnings(email: string): string[] {
  const [local, domain] = email.toLowerCase().split('@');
  const warnings: string[] = [];
  if (/^(info|hello|contact|support|admin|jobs|careers|hr|recruiting|sales|noreply|no-reply)$/.test(local)) warnings.push('Shared or role mailbox; individual recipient is unverified');
  const typo: Record<string, string> = { 'gmial.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.con': 'gmail.com', 'outlok.com': 'outlook.com', 'hotmial.com': 'hotmail.com', 'yaho.com': 'yahoo.com' };
  if (typo[domain]) warnings.push(`Possible domain typo: did you mean ${typo[domain]}? Edit the address to confirm; it is never corrected automatically.`);
  return warnings;
}
