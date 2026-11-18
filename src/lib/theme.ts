/** Shared visual meaning. Status colors never depend on which page renders them. */
export type Tone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'violet' | 'teal' | 'pink';
export const STATUS_TONE: Record<string, Tone> = {
  PENDING: 'warning', APPROVED: 'success', PASSED: 'success', CONNECTED: 'success',
  PAUSED: 'warning', RETRY: 'warning', OUT_OF_OFFICE: 'warning',
  BLOCKED: 'danger', BOUNCED: 'danger', FAILED: 'danger', NEGATIVE: 'danger',
  POSITIVE: 'success', NEUTRAL: 'neutral', NOT_NOW: 'pink',
};
export const TRACK_TONE: Record<string, Tone> = { HYBRID_DEFAULT: 'info', BRAND: 'pink', AI_PMM: 'violet', AI_PM: 'teal' };
export const GEO_TONE: Record<string, Tone> = { INDIA: 'info', US: 'violet', GLOBAL: 'teal' };
export const TOUCH_TONE: Record<string, Tone> = { T1: 'info', T2A: 'warning', T2B: 'violet', T3: 'teal', T4: 'pink' };
export const ANALYTIC_TONE = { open: 'info', click: 'warning', reply: 'violet', positive: 'success', portfolio: 'teal', bounce: 'danger', sent: 'info' } as const;
export const toneColor = (tone: Tone) => tone === 'neutral' ? 'var(--color-muted)' : `var(--color-${tone})`;
