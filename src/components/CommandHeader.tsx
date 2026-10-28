'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  FileSpreadsheet,
  Flame,
  Kanban,
  Layers,
  MessageSquareWarning,
  Play,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ExecutionMode, GlobalKPIs, SystemSettings } from '@/types/outreach';

interface CommandHeaderProps {
  kpis?: GlobalKPIs | null;
  onRefreshData?: () => void;
}

export default function CommandHeader({ kpis: externalKpis, onRefreshData }: CommandHeaderProps) {
  const pathname = usePathname();
  const [kpis, setKpis] = useState<GlobalKPIs | null>(externalKpis || null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isRunningCron, setIsRunningCron] = useState(false);
  const [isTogglingMode, setIsTogglingMode] = useState(false);
  const [cronResultModal, setCronResultModal] = useState<{
    threadsPolled: number;
    repliesDetected: number;
    bouncesDetected: number;
    ghostedArchived: number;
    emailsDispatched: number;
    awaitingApprovalGate: number;
    skippedOutsideWindow: number;
  } | null>(null);

  const fetchHeaderState = useCallback(async () => {
    try {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      if (data.kpis) setKpis(data.kpis);
    } catch {
      // Ignore transient errors
    }
  }, []);

  useEffect(() => {
    fetchHeaderState();
  }, [fetchHeaderState]);

  useEffect(() => {
    if (externalKpis) {
      setKpis(externalKpis);
    }
  }, [externalKpis]);

  const handleToggleExecutionMode = async () => {
    if (!settings || isTogglingMode) return;
    setIsTogglingMode(true);
    const nextMode: ExecutionMode =
      settings.execution_mode === 'APPROVAL_GATE' ? 'AUTO_PILOT' : 'APPROVAL_GATE';
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execution_mode: nextMode }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        if (data.kpis) setKpis(data.kpis);
        onRefreshData?.();
      }
    } finally {
      setIsTogglingMode(false);
    }
  };

  const handleRunQueueNow = async (ignoreWindow = false) => {
    if (isRunningCron) return;
    setIsRunningCron(true);
    try {
      const res = await fetch('/api/cron/process-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-outreach-manual-trigger': 'true',
        },
        body: JSON.stringify({ ignoreTimezoneWindow: ignoreWindow }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.kpis) setKpis(data.kpis);
        if (data.summary) setCronResultModal(data.summary);
        onRefreshData?.();
      }
    } finally {
      setIsRunningCron(false);
    }
  };

  const navItems = [
    { href: '/', label: '8-Stage Funnel', icon: Kanban },
    {
      href: '/approvals',
      label: 'Morning Queue',
      icon: ShieldCheck,
      badge: kpis?.pending_approvals || 0,
    },
    { href: '/import', label: 'CSV Importer', icon: FileSpreadsheet },
    { href: '/templates', label: 'Sequence Studio', icon: Layers },
    { href: '/settings', label: 'Settings & Telemetry', icon: Settings },
  ];

  const quotaPct = kpis
    ? Math.min(100, Math.round((kpis.sent_today / Math.max(1, kpis.daily_send_limit)) * 100))
    : 0;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#27272A] bg-[#09090B]/95 backdrop-blur-md">
        {/* Top Row: Identity, Navigation, Mode Switch, Manual Sync */}
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          {/* Brand Crest */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="flex h-8 w-8 items-center justify-center rounded border border-[#27272A] bg-[#121215] text-emerald-400 shadow-inner group-hover:border-emerald-500/50 transition-colors">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold tracking-widest text-[#FAFAFA]">
                    OUTREACH-OS
                  </span>
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-400">
                    v1.0
                  </span>
                </div>
                <p className="font-mono text-[10px] text-zinc-500">
                  SUMAN DEBNATH // HIRING FUNNEL CRM
                </p>
              </div>
            </Link>

            {/* Storage & Provider Telemetry Pill */}
            <div className="hidden xl:flex items-center gap-1.5 rounded border border-[#27272A] bg-[#121215] px-2.5 py-1 text-[11px] font-mono text-zinc-400">
              <Database className="h-3 w-3 text-emerald-400" />
              <span>
                {kpis?.storage_engine === 'SUPABASE' ? 'SUPABASE LIVE' : 'LOCAL JSON DB'}
              </span>
              <span className="text-zinc-700">|</span>
              <span className="text-zinc-300">{settings?.send_provider || 'GMAIL'}</span>
            </div>
          </div>

          {/* Primary Navigation */}
          <nav className="flex items-center gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? 'border border-zinc-700 bg-[#18181C] text-[#FAFAFA] shadow-sm'
                      : 'border border-transparent text-zinc-400 hover:bg-[#121215] hover:text-zinc-200'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${active ? 'text-emerald-400' : 'text-zinc-500'}`} />
                  <span>{item.label}</span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="ml-0.5 rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-amber-300">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Controls: Autonomy Mode Switcher & Sync Queue Trigger */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleExecutionMode}
              disabled={isTogglingMode}
              title="Click to switch between Approval Gate (human sign-off) and Auto-Pilot (autonomous within business hours)"
              className={`flex items-center gap-2 rounded border px-2.5 py-1.5 font-mono text-[11px] font-medium transition-all ${
                settings?.execution_mode === 'AUTO_PILOT'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
              }`}
            >
              {settings?.execution_mode === 'AUTO_PILOT' ? (
                <>
                  <Zap className="h-3.5 w-3.5 text-emerald-400" />
                  <span>MODE: AUTO-PILOT</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                  <span>MODE: APPROVAL GATE</span>
                </>
              )}
            </button>

            <button
              onClick={() => handleRunQueueNow(false)}
              disabled={isRunningCron}
              className="flex items-center gap-1.5 rounded border border-[#27272A] bg-[#121215] px-3 py-1.5 text-xs font-medium text-[#FAFAFA] hover:border-zinc-600 hover:bg-[#18181C] disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-emerald-400 ${isRunningCron ? 'animate-spin' : ''}`} />
              <span>{isRunningCron ? 'Polling & Syncing...' : 'Sync Replies & Run Queue'}</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Global Real-Time Telemetry Bar */}
        <div className="border-t border-[#27272A]/80 bg-[#0D0D10] px-4 py-1.5">
          <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-zinc-500">Total Leads</span>
                <span className="font-mono text-xs font-semibold text-[#FAFAFA]">
                  {kpis?.total_leads ?? '—'}
                </span>
              </div>

              <div className="h-3 w-[1px] bg-[#27272A]" />

              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-sky-400" />
                <span className="text-[11px] uppercase tracking-wider text-zinc-400">
                  Active in Sequence
                </span>
                <span className="font-mono text-xs font-semibold text-sky-400">
                  {kpis?.active_in_sequence ?? '—'}
                </span>
              </div>

              <div className="h-3 w-[1px] bg-[#27272A]" />

              <div className="flex items-center gap-2">
                <Flame className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[11px] uppercase tracking-wider text-zinc-400">
                  Warm Engaged (High Intent)
                </span>
                <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 font-mono text-xs font-bold text-amber-400">
                  {kpis?.warm_engaged ?? '—'}
                </span>
              </div>

              <div className="h-3 w-[1px] bg-[#27272A]" />

              <div className="flex items-center gap-2">
                <MessageSquareWarning className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[11px] uppercase tracking-wider text-zinc-400">
                  Replies Needing Triage
                </span>
                <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 font-mono text-xs font-bold text-emerald-400">
                  {kpis?.replies_needing_triage ?? '—'}
                </span>
              </div>

              <div className="h-3 w-[1px] bg-[#27272A]" />

              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-[11px] uppercase tracking-wider text-zinc-400">
                  Active Interviews
                </span>
                <span className="font-mono text-xs font-semibold text-indigo-400">
                  {kpis?.active_interviews ?? '—'}
                </span>
              </div>
            </div>

            {/* Daily Send Quota Meter */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-zinc-400">
                  Today&apos;s Quota
                </span>
                <span className="font-mono text-xs font-semibold text-[#FAFAFA]">
                  {kpis?.sent_today ?? 0} / {kpis?.daily_send_limit ?? 45}
                </span>
              </div>
              <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-800 border border-zinc-700">
                <div
                  className={`h-full transition-all ${
                    quotaPct >= 90
                      ? 'bg-rose-500'
                      : quotaPct >= 65
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Queue Execution Summary Modal */}
      {cronResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-[#27272A] bg-[#121215] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#FAFAFA]">
                  Queue & Reply Poll Cycle Complete
                </h3>
              </div>
              <button
                onClick={() => setCronResultModal(null)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                ESC
              </button>
            </div>

            <div className="mt-4 space-y-2.5 font-mono text-xs">
              <div className="flex justify-between rounded border border-[#27272A] bg-[#09090B] px-3 py-2">
                <span className="text-zinc-400">Gmail Threads Polled:</span>
                <span className="font-bold text-[#FAFAFA]">{cronResultModal.threadsPolled}</span>
              </div>
              <div className="flex justify-between rounded border border-[#27272A] bg-[#09090B] px-3 py-2">
                <span className="text-zinc-400">Inbound Replies Halted:</span>
                <span className="font-bold text-emerald-400">{cronResultModal.repliesDetected}</span>
              </div>
              <div className="flex justify-between rounded border border-[#27272A] bg-[#09090B] px-3 py-2">
                <span className="text-zinc-400">Emails Dispatched Now:</span>
                <span className="font-bold text-sky-400">{cronResultModal.emailsDispatched}</span>
              </div>
              <div className="flex justify-between rounded border border-[#27272A] bg-[#09090B] px-3 py-2">
                <span className="text-zinc-400">Awaiting Morning Approval Gate:</span>
                <span className="font-bold text-amber-400">
                  {cronResultModal.awaitingApprovalGate}
                </span>
              </div>
              <div className="flex justify-between rounded border border-[#27272A] bg-[#09090B] px-3 py-2">
                <span className="text-zinc-400">Deferred (Outside IST/EST Window):</span>
                <span className="font-bold text-zinc-300">
                  {cronResultModal.skippedOutsideWindow}
                </span>
              </div>
              <div className="flex justify-between rounded border border-[#27272A] bg-[#09090B] px-3 py-2">
                <span className="text-zinc-400">Ghosted T4 Auto-Archived:</span>
                <span className="font-bold text-rose-400">{cronResultModal.ghostedArchived}</span>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              {cronResultModal.skippedOutsideWindow > 0 && (
                <button
                  onClick={() => handleRunQueueNow(true)}
                  className="flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Force Send Outside Window</span>
                </button>
              )}
              <button
                onClick={() => setCronResultModal(null)}
                className="ml-auto rounded bg-[#FAFAFA] px-4 py-2 text-xs font-semibold text-[#09090B] hover:bg-zinc-200"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
