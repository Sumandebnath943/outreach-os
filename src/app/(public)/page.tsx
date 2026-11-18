import type { Metadata } from "next";
import Link from "next/link";
import { Activity, BrainCircuit, MailCheck } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { safeNext } from "@/lib/session";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: `${BRAND.name} · Sign in`,
  description: BRAND.description,
};

const FEATURES = [
  { icon: MailCheck, title: "Personal sequences", text: "Thoughtful follow-ups from your Gmail." },
  { icon: BrainCircuit, title: "Reply intelligence", text: "Know when to step in and what matters." },
  { icon: Activity, title: "Clear pipeline", text: "Every conversation has a next step." },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const lead = typeof sp.lead === "string" ? sp.lead : null;
  const next = safeNext(typeof sp.next === "string" ? sp.next : lead ? `/pipeline?lead=${encodeURIComponent(lead)}` : null);
  const configured = Boolean(process.env.DASHBOARD_PASSWORD) || process.env.NODE_ENV !== "production";

  return (
    <div className="home-surface flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300/30 bg-emerald-300/10 text-emerald-300">
            <Activity className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">{BRAND.name}</span>
        </div>
        <span className="font-mono text-[11px] tracking-wider text-emerald-300 uppercase">Private workspace</span>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-10 lg:grid-cols-[1.25fr_1fr]">
        <section>
          <p className="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">Outreach CRM</p>
          <h1 className="mt-3 max-w-2xl text-4xl leading-tight font-semibold tracking-tight md:text-6xl">Run your <span className="text-emerald-300">job search</span> like a revenue pipeline.</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">Personal outreach and timely follow-ups, with every reply in one place.</p>
          <div aria-label="From first contact to interview" className="my-8 flex flex-wrap items-center gap-2 text-xs">
            {[['Queued', 'border-sky-400/30 bg-sky-400/10 text-sky-200'], ['Engaged', 'border-amber-400/30 bg-amber-400/10 text-amber-200'], ['Replied', 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'], ['Interview', 'border-violet-400/30 bg-violet-400/10 text-violet-200']].map(([label, color], index) => <div className="flex items-center gap-2" key={label}>{index > 0 && <span aria-hidden className="text-muted">→</span>}<span className={`rounded-full border px-3 py-2 ${color}`}>{label}</span></div>)}
          </div>
          <ul className="mt-8 grid gap-x-6 gap-y-4 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
                <div>
                  <div className="text-sm font-medium">{title}</div>
                  <div className="mt-0.5 text-sm leading-relaxed text-dim">{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-emerald-200/15 bg-card/90 p-7 shadow-2xl shadow-emerald-950/30">
          <h2 className="text-lg font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 mb-6 text-sm text-dim">{BRAND.owner ? `Private workspace of ${BRAND.owner}.` : "Private workspace."}</p>
          <SignInForm next={next} configured={configured} />
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-6 text-xs text-dim">
        <span>
          © {new Date().getFullYear()} {BRAND.name}
        </span>
        <nav className="flex gap-5">
          <Link href="/privacy-policy" className="hover:text-fg">
            Privacy policy
          </Link>
          <Link href="/terms" className="hover:text-fg">
            Terms of service
          </Link>
        </nav>
      </footer>
    </div>
  );
}
