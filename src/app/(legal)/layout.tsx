import Link from "next/link";
import { LEGAL_CONTACT } from "@/lib/legal";

/** Public pages (privacy policy, terms): no dashboard chrome, no authenticated API calls. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <header className="mb-10 flex items-center justify-between border-b border-line pb-4">
        <span className="text-sm font-semibold tracking-tight">OutreachOS</span>
        <nav className="flex gap-4 text-xs text-dim">
          <Link href="/privacy-policy" className="hover:text-fg">
            Privacy policy
          </Link>
          <Link href="/terms" className="hover:text-fg">
            Terms of service
          </Link>
        </nav>
      </header>
      <article className="legal space-y-4 text-[15px] leading-relaxed text-muted">{children}</article>
      <footer className="mt-12 border-t border-line pt-4 text-xs text-dim">
        Questions: <a href={`mailto:${LEGAL_CONTACT}`} className="underline hover:text-fg">{LEGAL_CONTACT}</a>
      </footer>
    </div>
  );
}
