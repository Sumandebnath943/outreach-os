import type { Metadata } from "next";
import Link from "next/link";
import { Activity, BellRing, BrainCircuit, CalendarClock, MailCheck, MousePointerClick } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { safeNext } from "@/lib/session";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: `${BRAND.name} · Sign in`,
  description: BRAND.description,
};

const FEATURES = [
  { icon: MailCheck, title: "Personal sequences", text: "Four-touch, same-thread follow-ups from your own Gmail, in each recipient's business hours." },
  { icon: MousePointerClick, title: "Real intent signals", text: "Opens, clicks and portfolio visits, with bots filtered out, switch leads to a warmer follow-up." },
  { icon: BrainCircuit, title: "AI reply triage", text: "Every reply is read, labelled and summarised; out-of-office replies resume on their own." },
  { icon: BellRing, title: "Instant alerts", text: "Telegram pings for replies with a draft answer, plus a morning digest." },
  { icon: CalendarClock, title: "Sender-safe pacing", text: "Warm-up, daily caps, human jitter, holidays and weekends handled for you." },
  { icon: Activity, title: "Funnel analytics", text: "Reply, click and bounce rates by touch, track and region, from first email to offer." },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const lead = typeof sp.lead === "string" ? sp.lead : null;
  const next = safeNext(typeof sp.next === "string" ? sp.next : lead ? `/pipeline?lead=${encodeURIComponent(lead)}` : null);
  const configured = Boolean(process.env.DASHBOARD_PASSWORD) || process.env.NODE_ENV !== "production";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded border border-line bg-card">
            <Activity className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">{BRAND.name}</span>
        </div>
        <span className="font-mono text-[11px] tracking-wider text-dim uppercase">Private workspace</span>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-10 lg:grid-cols-[1.25fr_1fr]">
        <section>
          <p className="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">Outreach CRM</p>
          <h1 className="mt-3 text-4xl leading-tight font-semibold tracking-tight md:text-5xl">{BRAND.tagline}</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">{BRAND.description}</p>
          <ul className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2">
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

        <section className="rounded-xl border border-line bg-card p-7 shadow-2xl">
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
