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
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="flex h-12 items-center gap-4 border-b border-line px-5 lg:gap-6">
        <Link href="/pipeline" className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded border border-line bg-card">
            <Activity className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight">OutreachOS</span>
        </Link>
        <nav className="flex items-center gap-1">
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
                  <span className="ml-1.5 rounded bg-amber-400/15 px-1 font-mono text-[10px] text-amber-300">{s.pendingApprovals}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
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
                  "flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[11px] tracking-wide whitespace-nowrap transition-colors",
                  s?.executionMode === m
                    ? m === "AUTO_PILOT"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-amber-500/15 text-amber-300"
                    : "text-dim hover:text-fg",
                )}
              >
                {m === "AUTO_PILOT" ? <Bot className="h-3 w-3" /> : <Hand className="h-3 w-3" />}
                {m === "AUTO_PILOT" ? "AUTO-PILOT" : <>APPROVAL<span className="hidden xl:inline"> GATE</span></>}
              </button>
            ))}
          </div>
          <Button size="sm" variant="primary" onClick={runQueue} loading={running} className="whitespace-nowrap">
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
      <div className="grid grid-cols-3 gap-x-6 gap-y-2 px-5 py-2.5 md:grid-cols-6">
        <Metric label="Total Leads" value={s?.total ?? "—"} />
        <Metric label="Active in Sequence" value={s?.activeInSequence ?? "—"} tone="text-sky-300" />
        <Metric label="Warm · High Intent" value={s?.warm ?? "—"} tone="text-amber-300" />
        <Metric label="Replies · Triage" value={s?.triage ?? "—"} tone="text-emerald-300" />
        <Metric label="Active Interviews" value={s?.interviewing ?? "—"} tone="text-emerald-200" />
        <div className="min-w-0">
          <Metric
            label="Today's Quota"
            value={s ? s.sentToday : "—"}
            sub={s ? `/ ${s.dailyLimit}${s.warmupWeek ? ` · warm-up wk ${s.warmupWeek}` : ""}` : undefined}
            tone={s && s.sentToday >= s.dailyLimit ? "text-rose-300" : undefined}
          />
          <div className="mt-1 h-0.5 w-full overflow-hidden rounded bg-line">
            <div className={cn("h-full", quotaPct >= 100 ? "bg-rose-400" : "bg-fg")} style={{ width: `${quotaPct}%` }} />
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-dim">
            run {relTime(s?.lastQueueRunAt)} · next slot {s?.nextDispatchAt && new Date(s.nextDispatchAt) > new Date() ? relTime(s.nextDispatchAt) : "open"}
          </div>
        </div>
      </div>
    </header>
  );
}
