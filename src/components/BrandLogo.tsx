import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

/** Signal Arc: the owner-selected emblem and wordmark, shared by every app surface. */
export function BrandLogo({ className, large = false }: { className?: string; large?: boolean }) {
  return <span className={cn('inline-flex items-center gap-2 font-medium tracking-tight', large ? 'text-2xl' : 'text-sm', className)}>
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn('shrink-0 text-accent', large ? 'h-12 w-12' : 'h-8 w-8')} fill="none" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M42 12a23 23 0 1 0 0 40M24 20a14 14 0 0 1 0 24" />
      <circle cx="49" cy="32" r="5" fill="currentColor" stroke="none" />
    </svg>
    <span aria-label={BRAND.name}>Outreach<span className="font-normal text-accent">OS</span></span>
  </span>;
}
