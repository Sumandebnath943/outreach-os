'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2,
  Code2,
  Copy,
  KeyRound,
  Play,
  Save,
  Settings,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import CommandHeader from '@/components/CommandHeader';
import {
  ExecutionMode,
  GlobalKPIs,
  Lead,
  SendProvider,
  SystemSettings,
} from '@/types/outreach';

interface Diagnostics {
  supabaseConfigured: boolean;
  emailCredentialsConfigured: boolean;
  googleClientIdSet: boolean;
  googleClientSecretSet: boolean;
  gmailRefreshTokenSet: boolean;
  resendApiKeySet: boolean;
  cronSecretSet: boolean;
  adminPasscodeSet: boolean;
}

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [kpis, setKpis] = useState<GlobalKPIs | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Webhook Test Simulator State
  const [testLeadId, setTestLeadId] = useState('');
  const [testPath, setTestPath] = useState('/agents/migi');
  const [testDuration, setTestDuration] = useState(92);
  const [webhookResult, setWebhookResult] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const [settingsRes, leadsRes] = await Promise.all([
      fetch('/api/settings', { cache: 'no-store' }),
      fetch('/api/leads', { cache: 'no-store' }),
    ]);
    if (settingsRes.ok) {
      const data = await settingsRes.json();
      setSettings(data.settings);
      setKpis(data.kpis);
      setDiagnostics(data.diagnostics);
    }
    if (leadsRes.ok) {
      const lData = await leadsRes.json();
      const loadedLeads: Lead[] = lData.leads || [];
      setLeads(loadedLeads);
      if (loadedLeads.length > 0 && !testLeadId) {
        setTestLeadId(loadedLeads[0].id);
      }
    }
  }, [testLeadId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSavedBanner(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setKpis(data.kpis);
        setSavedBanner('System settings saved and applied across OutreachOS.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!testLeadId) return;
    setWebhookResult(null);
    const res = await fetch('/api/track/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: testLeadId,
        path: testPath,
        durationSec: testDuration,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setWebhookResult(
        `200 OK — Logged visit to ${data.path} (${data.durationSec}s) for lead ${data.leadId.slice(
          0,
          8
        )}... Stage: ${data.stage}`
      );
      loadSettings();
    } else {
      setWebhookResult(`Error: ${data.error}`);
    }
  };

  const appOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://outreach-os.vercel.app';

  const portfolioSnippetCode = `'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const OUTREACH_OS_WEBHOOK = '${appOrigin}/api/track/portfolio';

export function PortfolioTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const enteredAtRef = useRef<number>(Date.now());

  useEffect(() => {
    // 1. Capture ?ref={{lead_uuid}} from incoming cold email link & persist in sessionStorage
    const urlRef = searchParams?.get('ref');
    if (urlRef) {
      sessionStorage.setItem('outreach_os_ref', urlRef);
    }

    const activeRef = urlRef || sessionStorage.getItem('outreach_os_ref');
    if (!activeRef) return;

    enteredAtRef.current = Date.now();

    // 2. Fire immediate pageview beacon
    fetch(OUTREACH_OS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: activeRef,
        path: pathname || '/',
        durationSec: 5,
        referrer: document.referrer || null,
      }),
      keepalive: true,
    }).catch(() => {});

    // 3. Log exact dwell duration when recruiter navigates away or closes tab
    const sendDwellDuration = () => {
      const durationSec = Math.round((Date.now() - enteredAtRef.current) / 1000);
      if (durationSec < 2) return;
      const payload = JSON.stringify({
        ref: activeRef,
        path: pathname || '/',
        durationSec,
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(OUTREACH_OS_WEBHOOK, payload);
      }
    };

    window.addEventListener('pagehide', sendDwellDuration);
    return () => {
      sendDwellDuration();
      window.removeEventListener('pagehide', sendDwellDuration);
    };
  }, [pathname, searchParams]);

  return null;
}`;

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(portfolioSnippetCode);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2500);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#09090B]">
      <CommandHeader kpis={kpis} onRefreshData={loadSettings} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 space-y-6">
        {/* Top Page Title */}
        <div className="rounded-lg border border-[#27272A] bg-[#121215] p-5">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-emerald-400" />
            <h1 className="text-base font-bold uppercase tracking-wider text-[#FAFAFA]">
              System Settings, Deliverability Guardrails & Portfolio Telemetry
            </h1>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Configure Gmail OAuth2 / Resend dispatch engines, daily volume caps, randomized human jitter, and copy the &lt;PortfolioTracker /&gt; snippet for sumandebnath.houseofnamus.com.
          </p>
        </div>

        {savedBanner && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3.5 font-mono text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            <span>{savedBanner}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT 2 COLUMNS: System Settings Form */}
          <form
            onSubmit={handleSave}
            className="lg:col-span-2 rounded-lg border border-[#27272A] bg-[#121215] p-5 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#FAFAFA]">
                1. Outbound Engine & Deliverability Guardrails
              </h2>
              <button
                type="submit"
                disabled={saving || !settings}
                className="flex items-center gap-1.5 rounded bg-emerald-500 px-4 py-1.5 text-xs font-bold text-[#09090B] hover:bg-emerald-400 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            </div>

            {settings && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                      Primary Email Dispatch Engine
                    </label>
                    <select
                      value={settings.send_provider}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          send_provider: e.target.value as SendProvider,
                        })
                      }
                      className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="GMAIL">
                        GMAIL API (OAuth2 + RFC 2822 Same-Thread Chaining)
                      </option>
                      <option value="RESEND">
                        RESEND API (Custom Domain Transactional Engine)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                      Global Autonomy Mode
                    </label>
                    <select
                      value={settings.execution_mode}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          execution_mode: e.target.value as ExecutionMode,
                        })
                      }
                      className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="APPROVAL_GATE">
                        APPROVAL_GATE (1-Click Morning Batch Sign-Off)
                      </option>
                      <option value="AUTO_PILOT">
                        AUTO_PILOT (100% Autonomous in Recipient Business Hours)
                      </option>
                    </select>
                  </div>
                </div>

                {/* Daily Cap & Jitter */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                      Daily Send Limit (Hard Cap)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={settings.daily_send_limit}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          daily_send_limit: Number(e.target.value),
                        })
                      }
                      className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 font-mono text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                      Min Jitter Delay (Minutes)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={settings.min_delay_minutes}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          min_delay_minutes: Number(e.target.value),
                        })
                      }
                      className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 font-mono text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                      Max Jitter Delay (Minutes)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={settings.max_delay_minutes}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          max_delay_minutes: Number(e.target.value),
                        })
                      }
                      className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 font-mono text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Sender Identity */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#27272A]">
                  <div>
                    <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                      Sender Full Name
                    </label>
                    <input
                      type="text"
                      value={settings.sender_name}
                      onChange={(e) =>
                        setSettings({ ...settings, sender_name: e.target.value })
                      }
                      className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                      Sender Email Address
                    </label>
                    <input
                      type="email"
                      value={settings.sender_email}
                      onChange={(e) =>
                        setSettings({ ...settings, sender_email: e.target.value })
                      }
                      className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 font-mono text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Tracked Destination URLs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                      Portfolio Base URL (`{'{{tracked_portfolio_url}}'}`)
                    </label>
                    <input
                      type="url"
                      value={settings.portfolio_base_url}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          portfolio_base_url: e.target.value,
                        })
                      }
                      className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 font-mono text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                      Résumé URL (`{'{{tracked_resume_url}}'}`)
                    </label>
                    <input
                      type="url"
                      value={settings.resume_url}
                      onChange={(e) =>
                        setSettings({ ...settings, resume_url: e.target.value })
                      }
                      className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 font-mono text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Optional Gmail OAuth Refresh Token Override */}
                <div className="pt-2 border-t border-[#27272A]">
                  <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                    Gmail OAuth2 Refresh Token (Optional DB Override for `GMAIL_REFRESH_TOKEN`)
                  </label>
                  <input
                    type="password"
                    value={settings.gmail_refresh_token || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        gmail_refresh_token: e.target.value || null,
                      })
                    }
                    placeholder="1//04... (Leave blank to use GMAIL_REFRESH_TOKEN from .env.local)"
                    className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 font-mono text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </form>

          {/* RIGHT COLUMN: Environment Diagnostics & Timezone Rules */}
          <div className="space-y-4">
            <div className="rounded-lg border border-[#27272A] bg-[#121215] p-5 space-y-3">
              <div className="flex items-center gap-2 border-b border-[#27272A] pb-2.5">
                <KeyRound className="h-4 w-4 text-emerald-400" />
                <h3 className="font-mono text-xs font-bold uppercase text-[#FAFAFA]">
                  Environment & API Diagnostics
                </h3>
              </div>

              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Database Engine:</span>
                  <span
                    className={
                      diagnostics?.supabaseConfigured
                        ? 'text-emerald-400 font-bold'
                        : 'text-amber-300 font-bold'
                    }
                  >
                    {diagnostics?.supabaseConfigured ? 'SUPABASE' : 'LOCAL JSON (.data)'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">GOOGLE_CLIENT_ID:</span>
                  <span
                    className={
                      diagnostics?.googleClientIdSet ? 'text-emerald-400' : 'text-zinc-500'
                    }
                  >
                    {diagnostics?.googleClientIdSet ? 'Configured' : 'Not Set'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">GMAIL_REFRESH_TOKEN:</span>
                  <span
                    className={
                      diagnostics?.gmailRefreshTokenSet ? 'text-emerald-400' : 'text-zinc-500'
                    }
                  >
                    {diagnostics?.gmailRefreshTokenSet ? 'Configured' : 'Not Set'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">RESEND_API_KEY:</span>
                  <span
                    className={
                      diagnostics?.resendApiKeySet ? 'text-emerald-400' : 'text-zinc-500'
                    }
                  >
                    {diagnostics?.resendApiKeySet ? 'Configured' : 'Not Set'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">CRON_SECRET:</span>
                  <span
                    className={
                      diagnostics?.cronSecretSet ? 'text-emerald-400' : 'text-zinc-500'
                    }
                  >
                    {diagnostics?.cronSecretSet ? 'Configured' : 'Optional'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[#27272A] bg-[#121215] p-5 space-y-3">
              <div className="flex items-center gap-2 border-b border-[#27272A] pb-2.5">
                <ShieldCheck className="h-4 w-4 text-sky-400" />
                <h3 className="font-mono text-xs font-bold uppercase text-[#FAFAFA]">
                  Recipient Timezone Enforcement
                </h3>
              </div>
              <ul className="space-y-2 font-mono text-[11px] text-zinc-400">
                <li>
                  <strong className="text-orange-300">INDIA (IST):</strong> Mon–Fri · 10:00 AM – 6:00 PM Asia/Kolkata
                </li>
                <li>
                  <strong className="text-blue-300">US (EST):</strong> Mon–Fri · 9:00 AM – 5:00 PM America/New_York
                </li>
                <li>
                  <strong className="text-zinc-200">GLOBAL (UTC):</strong> Mon–Fri · 9:00 AM – 6:00 PM UTC
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Cross-Origin Portfolio Telemetry Snippet & Live Webhook Tester */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-lg border border-[#27272A] bg-[#121215] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#27272A] pb-3">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-amber-400" />
                <h2 className="font-mono text-xs font-bold uppercase text-[#FAFAFA]">
                  2. Portfolio Telemetry Client Component (`sumandebnath.houseofnamus.com`)
                </h2>
              </div>

              <button
                onClick={handleCopySnippet}
                className="flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 font-mono text-xs text-emerald-300 hover:bg-emerald-500/20"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>{copiedSnippet ? 'Copied to Clipboard!' : 'Copy Next.js Snippet'}</span>
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Mount &lt;PortfolioTracker /&gt; inside your portfolio&apos;s root app/layout.tsx. When a recruiter clicks https://sumandebnath.houseofnamus.com/?ref={'{{lead_uuid}}'} from your email, it logs every visited page and dwell duration back to OutreachOS in real time.
            </p>

            <pre className="overflow-x-auto rounded border border-[#27272A] bg-[#09090B] p-4 font-mono text-[11px] leading-relaxed text-zinc-300 max-h-80">
              {portfolioSnippetCode}
            </pre>
          </div>

          {/* Live CORS Webhook Simulator */}
          <div className="rounded-lg border border-[#27272A] bg-[#121215] p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#27272A] pb-2.5">
              <Terminal className="h-4 w-4 text-emerald-400" />
              <h3 className="font-mono text-xs font-bold uppercase text-[#FAFAFA]">
                Test `/api/track/portfolio` Webhook
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                  Target Lead (`?ref=lead_uuid`)
                </label>
                <select
                  value={testLeadId}
                  onChange={(e) => setTestLeadId(e.target.value)}
                  className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-[#FAFAFA]"
                >
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.company_name} — {l.first_name} ({l.funnel_stage})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                  Simulated Portfolio Page Path
                </label>
                <input
                  type="text"
                  value={testPath}
                  onChange={(e) => setTestPath(e.target.value)}
                  placeholder="/agents/migi"
                  className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 font-mono text-[#FAFAFA]"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                  Simulated Dwell Duration (Seconds)
                </label>
                <input
                  type="number"
                  value={testDuration}
                  onChange={(e) => setTestDuration(Number(e.target.value))}
                  className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 font-mono text-[#FAFAFA]"
                />
              </div>

              <button
                type="button"
                onClick={handleTestWebhook}
                className="flex w-full items-center justify-center gap-1.5 rounded bg-[#FAFAFA] py-2 text-xs font-bold text-[#09090B] hover:bg-zinc-200"
              >
                <Play className="h-3.5 w-3.5" />
                <span>Fire Live Portfolio Webhook</span>
              </button>

              {webhookResult && (
                <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-2.5 font-mono text-[11px] text-emerald-300">
                  {webhookResult}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
