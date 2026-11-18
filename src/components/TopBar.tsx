"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, Bot, Hand, LogOut, RefreshCw } from "lucide-react";

async function signOut() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.assign("/");
  }
}
import { api, broadcastRefresh, usePoll } from "@/lib/client";
import { cn, relTime } from "@/lib/utils";
import { touchLabel } from "@/lib/meta";
import type { DashboardStats, ExecutionMode, QueueReport } from "@/lib/types";
import { Button, Metric, toast } from "./ui";

const NAV = [
  { href: "/pipeline", label: "Pipeline" },
  { href: "/leads", label: "Leads" },
  { href: "/prechecks", label: "Prechecks" },
  { href: "/approvals", label: "Approvals" },
  { href: "/analytics", label: "Analytics" },
  { href: "/import", label: "Import" },
  { href: "/templates", label: "Templates" },
  { href: "/settings", label: "Settings" },
];

export function TopBar() {
  const pathname = usePathname();
  const { data: s, reload } = usePoll<DashboardStats>("/api/stats", 15000);
  const [running, setRunning] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function runQueue() {
    setRunning(true);
    try {
      const r = await api<QueueReport>("/api/queue/run", { method: "POST" });
      const parts = [
        r.sent.length ? `Sent ${r.sent.map((x) => `${touchLabel(x.touch, x.variant)} → ${x.email}`).join(", ")}` : "No email sent",
        r.repliesDetected ? `${r.repliesDetected} repl${r.repliesDetected > 1 ? "ies" : "y"} detected` : "",
        r.bounces ? `${r.bounces} bounce(s)` : "",
        r.archived ? `${r.archived} archived` : "",
        r.resurfaced ? `${r.resurfaced} resurfaced` : "",
      ].filter(Boolean);
      toast(parts.join(" · "), r.failed.length ? "err" : r.sent.length ? "ok" : "info");
      if (r.failed.length) toast(`Failed: ${r.failed.map((f) => `${f.email}: ${f.error}`).join(" | ")}`, "err");
      if (r.notes.length) toast(r.notes.join(" "), "info");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setRunning(false);
      reload();
      broadcastRefresh();
    }
  }

  async function setMode(mode: ExecutionMode) {
    if (!s || s.executionMode === mode) return;
    if (mode === "AUTO_PILOT" && !confirm("Switch to AUTO-PILOT? Due touches will send autonomously inside recipient business hours.")) return;
    setSwitching(true);
    try {
      await api("/api/settings", { method: "PUT", json: { execution_mode: mode } });
      toast(mode === "AUTO_PILOT" ? "Auto-pilot engaged" : "Approval gate engaged");
      reload();
      broadcastRefresh(); // Settings / Approvals pages hold their own copy of the mode
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSwitching(false);
    }
  }

  const quotaPct = s ? Math.min(100, (s.sentToday / Math.max(1, s.dailyLimit)) * 100) : 0;

  return (
    <>
    <aside className="light-surface fixed inset-y-0 left-0 z-40 hidden w-52 flex-col border-r border-line bg-bg px-3 py-5 lg:flex">
      <Link href="/pipeline" className="mb-8 flex items-center gap-2 px-3 text-sm font-semibold"><span className="rounded-md bg-accent p-1.5 text-accent-ink"><Activity className="h-4 w-4" /></span>OutreachOS</Link>
      <div className="mb-2 px-3 text-[10px] font-semibold tracking-wider text-dim uppercase">Workspace</div>
      <nav aria-label="Main navigation" className="space-y-1">{NAV.map(n => <Link key={n.href} href={n.href} aria-current={pathname.startsWith(n.href) ? 'page' : undefined} className={cn('flex items-center justify-between rounded-md px-3 py-2 text-[13px] transition-colors', pathname.startsWith(n.href) ? 'bg-card font-medium text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:bg-card hover:text-fg')}>{n.label}{n.href === '/approvals' && !!s?.pendingApprovals && <span className="text-xs tabular">{s.pendingApprovals}</span>}</Link>)}</nav>
      <div className="mt-auto border-t border-line px-3 pt-4 text-xs text-muted"><div className="mb-1 flex items-center gap-2"><span className={cn('h-1.5 w-1.5 rounded-full', s?.gmailConnected ? 'bg-emerald-600' : 'bg-rose-600')} />{s?.gmailConnected ? 'Gmail connected' : 'Gmail disconnected'}</div>Worker {relTime(s?.lastQueueRunAt)}</div>
    </aside>
    <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur lg:ml-52">
      <div className="flex min-h-12 flex-wrap items-center gap-3 py-2 border-b border-line px-5 lg:gap-6">
        <Link href="/pipeline" className="flex items-center gap-2 lg:hidden">
          <div className="flex h-6 w-6 items-center justify-center rounded border border-line bg-card">
            <Activity className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight">OutreachOS</span>
        </Link>
        <nav aria-label="Mobile navigation" className="lg:hidden flex min-w-0 max-w-full items-center gap-1 overflow-x-auto">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "relative rounded-md px-2.5 py-1 text-[13px] transition-colors",
                  active ? "bg-raised text-fg" : "text-dim hover:text-fg",
                )}
              >
                {n.label}
                {n.href === "/approvals" && s && s.pendingApprovals > 0 && (
                  <span className="ml-1.5 rounded bg-amber-400/15 px-1 font-mono text-[10px] text-warning">{s.pendingApprovals}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <span className="hidden text-sm text-muted lg:block">Workspace <span className="mx-2 text-line-strong">/</span><span className="font-medium text-fg">{NAV.find(n => pathname.startsWith(n.href))?.label || "Lead details"}</span></span>
        <div className="ml-auto flex w-full flex-wrap items-center justify-between gap-1 sm:w-auto sm:justify-start sm:gap-2">
          <span className="hidden items-center gap-1.5 font-mono text-[11px] text-dim lg:flex" title="Send provider">
            <span className={cn("h-1.5 w-1.5 rounded-full", s?.gmailConnected ? "bg-emerald-400" : "bg-rose-400")} />
            {s?.sendProvider ?? "—"} {s?.sendProvider === "GMAIL" && !s.gmailConnected ? "· disconnected" : ""}
          </span>
          <div className="flex rounded-md border border-line bg-card p-0.5">
            {(["APPROVAL_GATE", "AUTO_PILOT"] as const).map((m) => (
              <button
                key={m}
                disabled={switching}
                onClick={() => setMode(m)}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[11px] tracking-wide whitespace-nowrap transition-colors",
                  s?.executionMode === m
                    ? m === "AUTO_PILOT"
                      ? "bg-raised text-fg"
                      : "bg-raised text-fg"
                    : "text-dim hover:text-fg",
                )}
              >
                {m === "AUTO_PILOT" ? <Bot className="h-3 w-3" /> : <Hand className="h-3 w-3" />}
                {m === "AUTO_PILOT" ? "AUTO-PILOT" : <>APPROVAL<span className="hidden xl:inline"> GATE</span></>}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={runQueue} loading={running} className="whitespace-nowrap">
            {!running && <RefreshCw className="h-3.5 w-3.5" />}
            <span className="hidden lg:inline">Sync Replies &amp; Run Queue</span>
            <span className="lg:hidden">Run Queue</span>
          </Button>
          <button
            onClick={signOut}
            title="Sign out"
            aria-label="Sign out"
            className="flex h-7 w-7 items-center justify-center rounded-md text-dim transition-colors hover:bg-raised hover:text-fg"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {pathname === "/pipeline" && <div className="grid grid-cols-3 gap-x-6 gap-y-2 px-5 py-2.5 md:grid-cols-6">
        <Metric label="Total Leads" value={s?.total ?? "—"} />
        <Metric label="Active in Sequence" value={s?.activeInSequence ?? "—"} tone="text-stage-active" />
        <Metric label="Warm · High Intent" value={s?.warm ?? "—"} tone="text-stage-engaged" />
        <Metric label="Replies · Triage" value={s?.triage ?? "—"} tone="text-stage-replied" />
        <Metric label="Active Interviews" value={s?.interviewing ?? "—"} tone="text-stage-interview" />
        <div className="min-w-0">
          <Metric
            label="Today's Quota"
            value={s ? s.sentToday : "—"}
            sub={s ? `/ ${s.dailyLimit}` : undefined}
            tone={s && s.sentToday >= s.dailyLimit ? "text-danger" : undefined}
          />
          <div className="mt-1 h-0.5 w-full overflow-hidden rounded bg-line">
            <div className={cn("h-full", quotaPct >= 100 ? "bg-rose-400" : "bg-fg")} style={{ width: `${quotaPct}%` }} />
          </div>

        </div>
        <div className="col-span-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2 text-[11px] text-muted md:col-span-6">
          <span>{s?.warmupWeek ? `Warm-up week ${s.warmupWeek}` : "Daily send quota"}</span>
          {s?.quotaBreakdown && <span>{s.quotaBreakdown.outreach} outreach + {s.quotaBreakdown.test} test sends · {s.quotaBreakdown.bounced} of these bounced</span>}
          <span className="md:ml-auto">Worker {relTime(s?.lastQueueRunAt)} · next slot {s?.nextDispatchAt && new Date(s.nextDispatchAt) > new Date() ? relTime(s.nextDispatchAt) : "open"}</span>
        </div>
      </div>}
    </header>
    </>
  );
}
