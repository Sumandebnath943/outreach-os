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
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-700 text-white">
            <Activity className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">{BRAND.name}</span>
        </div>
        <span className="text-xs text-muted">Your personal outreach workspace</span>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-10 lg:grid-cols-[1.25fr_1fr]">
        <section>
          <p className="text-xs font-medium tracking-[0.15em] text-blue-700 uppercase">Make the next connection</p>
          <h1 className="mt-4 max-w-xl text-4xl leading-[1.1] font-semibold tracking-tight md:text-6xl">Good conversations.<br /><span className="text-muted">Better opportunities.</span></h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">A focused home for your job search. Reach out personally, follow up thoughtfully, and keep every conversation moving.</p>
          <div aria-label="Outreach workflow preview" className="my-8 max-w-lg rounded-xl border border-line bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between text-xs"><span className="font-medium">A clear next step, every time</span><span className="text-dim">Your workflow</span></div>
            <div className="flex items-center justify-between gap-1 text-xs">{['Import', 'Precheck', 'Outreach', 'Conversation'].map((label, index) => <div key={label} className="flex flex-1 items-center gap-1"><div className="flex flex-col gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${index === 2 ? 'bg-blue-700 text-white' : 'border border-line bg-bg text-muted'}`}>{index + 1}</span><span className={index === 2 ? 'font-medium text-blue-700' : 'text-muted'}>{label}</span></div>{index < 3 && <span className="mb-5 h-px flex-1 bg-line" />}</div>)}</div>
          </div>
          <ul className="mt-8 grid gap-x-6 gap-y-4 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                <div>
                  <div className="text-sm font-medium">{title}</div>
                  <div className="mt-0.5 text-sm leading-relaxed text-dim">{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-card p-7 shadow-sm lg:ml-8">
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
