import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from '@/components/BrandLogo';
import { BRAND } from "@/lib/brand";
import { safeNext } from "@/lib/session";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: `${BRAND.name} · Sign in`,
  description: BRAND.description,
};

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const lead = typeof sp.lead === "string" ? sp.lead : null;
  const next = safeNext(typeof sp.next === "string" ? sp.next : lead ? `/pipeline?lead=${encodeURIComponent(lead)}` : null);
  const configured = Boolean(process.env.DASHBOARD_PASSWORD) || process.env.NODE_ENV !== "production";

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center"><BrandLogo large /></div>
          <section aria-labelledby="sign-in-heading" className="light-surface w-full max-w-sm rounded-xl border border-line px-7 py-8 shadow-2xl shadow-black/15 sm:px-9 sm:py-10">
            <h1 id="sign-in-heading" className="sign-in-heading text-4xl tracking-tight">Sign in.</h1>
            <p className="mt-2 mb-7 text-sm text-muted">Your personal outreach workspace.</p>
            <SignInForm next={next} configured={configured} />
          </section>
        </div>
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-5 pb-6 text-xs text-dim">
        <span>© {new Date().getFullYear()} {BRAND.name}</span>
        <Link href="/privacy-policy" className="hover:text-fg">Privacy</Link>
        <Link href="/terms" className="hover:text-fg">Terms</Link>
      </footer>
    </div>
  );
}
