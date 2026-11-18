"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Link2, Send, Unplug } from "lucide-react";
import { api, broadcastRefresh, usePoll } from "@/lib/client";
import { portfolioSnippet } from "@/lib/snippet";
import type { SystemSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, Input, Label, Select, toast } from "@/components/ui";

interface SettingsResponse {
  settings: Omit<SystemSettings, "gmail_refresh_token">;
  status: {
    gmailConnected: boolean;
    gmailTokenSource: "database" | "env" | null;
    googleClientConfigured: boolean;
    resendConfigured: boolean;
    cronSecretSet: boolean;
    trackingSecretSet: boolean;
    dashboardAuth: boolean;
    appBaseUrl: string;
    ownerTimezone: string;
    portfolioOrigins: string[];
    telegramConfigured: boolean;
    digestTime: string;
    aiConfigured: boolean;
    aiModel: string | null;
    warmup: { cap: number; warmupWeek: number | null };
    holidays: { INDIA: { date: string; name: string }[]; US: { date: string; name: string }[]; indiaFestivalsUntil: number };
  };
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-zinc-100" />
      <span>
        {label}
        {hint && <span className="block text-xs text-dim">{hint}</span>}
      </span>
    </label>
  );
}

type Form = Omit<SystemSettings, "gmail_refresh_token" | "id" | "updated_at" | "next_dispatch_at" | "last_queue_run_at" | "last_digest_on">;

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <div className="text-sm font-medium">{title}</div>
        {desc && <div className="mt-0.5 text-xs text-dim">{desc}</div>}
      </div>
      {children}
    </Card>
  );
}

function StatusRow({ ok, label, detail, optional }: { ok: boolean; label: string; detail?: string; optional?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
      <span className="flex items-center gap-2">
        <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-400" : optional ? "bg-zinc-600" : "bg-rose-400")} />
        {label}
      </span>
      <span className="font-mono text-[11px] text-dim">{detail ?? (ok ? "ok" : "missing")}</span>
    </div>
  );
}

/** Editable subset of the settings (server-managed fields stripped). */
function toForm(s: SettingsResponse["settings"]): Form {
  const {
    id: _id,
    updated_at: _updated,
    next_dispatch_at: _next,
    last_queue_run_at: _lastRun,
    last_digest_on: _digest,
    gmail_refresh_token: _token,
    ...form
  } = s as SystemSettings;
  return form;
}

export default function SettingsPage() {
  const { data, setData, error } = usePoll<SettingsResponse>("/api/settings", 0);
  const [form, setFormState] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const setForm = (f: Form) => {
    setFormState(f);
    setDirty(true);
  };

  // Refreshes (e.g. the top-bar mode toggle) update the form only while it has no unsaved edits.
  useEffect(() => {
    if (data?.settings && !dirty) setFormState(toForm(data.settings));
  }, [data?.settings, dirty]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("gmail");
    if (!q) return;
    const msg: Record<string, [string, "ok" | "err"]> = {
      connected: ["Gmail connected — refresh token stored", "ok"],
      denied: ["Gmail consent was denied", "err"],
      state_mismatch: ["OAuth state mismatch — try again", "err"],
      no_refresh_token: ["Google returned no refresh token — remove the app at myaccount.google.com/permissions and retry", "err"],
      error: [`Gmail OAuth failed: ${new URLSearchParams(window.location.search).get("reason") ?? ""}`, "err"],
    };
    if (msg[q]) toast(...msg[q]);
    window.history.replaceState(null, "", "/settings");
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = useMemo(() => portfolioSnippet(data?.status.appBaseUrl || origin), [data?.status.appBaseUrl, origin]);

  if (!data || !form)
    return (
      <div className={cn("mx-auto max-w-5xl px-5 py-6 text-sm", error ? "text-rose-300" : "text-dim")}>
        {error ? `Could not load settings: ${error}` : "Loading settings…"}
      </div>
    );
  const st = data.status;
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(st.appBaseUrl);
  const baseUrlOk = !isLocal && st.appBaseUrl.startsWith("https://");
  const num = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: Number(e.target.value) });
  const str = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function sendTestAlert() {
    setTesting(true);
    try {
      await api("/api/notify/test", { method: "POST" });
      toast("Test alert sent — check Telegram");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setTesting(false);
    }
  }

  async function save(extra: Record<string, unknown> = {}) {
    if (!form || !data) return;
    // Send only what changed, so a stale copy can never revert a setting changed elsewhere.
    const base = toForm(data.settings);
    const changes = Object.fromEntries(
      (Object.keys(form) as (keyof Form)[]).filter((k) => form[k] !== base[k]).map((k) => [k, form[k]]),
    );
    if (!Object.keys(changes).length && !Object.keys(extra).length) {
      setDirty(false);
      return toast("Nothing to save", "info");
    }
    setSaving(true);
    try {
      const r = await api<SettingsResponse>("/api/settings", { method: "PUT", json: { ...changes, ...extra } });
      setDirty(false);
      setData(r);
      toast("Settings saved");
      broadcastRefresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-5 py-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">System Settings</h1>
          <p className="mt-1 text-sm text-dim">Deliverability guardrails, sending identity, provider and portfolio telemetry.</p>
        </div>
        <Button variant="primary" onClick={() => save()} loading={saving} disabled={!dirty}>
          Save settings
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Execution & provider">
          <div className="grid gap-3">
            <div>
              <Label>Execution mode</Label>
              <Select value={form.execution_mode} onChange={str("execution_mode")}>
                <option value="APPROVAL_GATE">APPROVAL GATE — human 1-click batch approval</option>
                <option value="AUTO_PILOT">AUTO-PILOT — fully autonomous in business hours</option>
              </Select>
            </div>
            <div>
              <Label>Send provider</Label>
              <Select value={form.send_provider} onChange={str("send_provider")}>
                <option value="GMAIL">GMAIL — OAuth2, primary-inbox placement, same-thread replies</option>
                <option value="RESEND">RESEND — custom-domain sender</option>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Daily cap</Label>
                <Input type="number" value={form.daily_send_limit} onChange={num("daily_send_limit")} />
              </div>
              <div>
                <Label>Min jitter (m)</Label>
                <Input type="number" min={1} value={form.min_delay_minutes} onChange={num("min_delay_minutes")} />
              </div>
              <div>
                <Label>Max jitter (m)</Label>
                <Input type="number" min={1} value={form.max_delay_minutes} onChange={num("max_delay_minutes")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Archive after T4 (bd)</Label>
                <Input type="number" value={form.archive_after_business_days} onChange={num("archive_after_business_days")} />
              </div>
              <div>
                <Label>Nurture re-engage (days)</Label>
                <Input type="number" value={form.reengage_after_days} onChange={num("reengage_after_days")} />
              </div>
            </div>
          </div>
        </Section>

        <Section title="Recipient send windows" desc="Mon–Fri only, local hour [start, end) in the recipient's timezone.">
          <div className="space-y-3">
            {(
              [
                ["india", "INDIA · Asia/Kolkata (IST)"],
                ["us", "US · America/New_York (EST/EDT)"],
                ["global", "GLOBAL · UTC"],
              ] as const
            ).map(([g, label]) => (
              <div key={g} className="grid grid-cols-[1fr_80px_80px] items-end gap-2">
                <div className="pb-2 text-sm text-muted">{label}</div>
                <div>
                  <Label>Start</Label>
                  <Input type="number" min={0} max={23} value={form[`${g}_window_start`]} onChange={num(`${g}_window_start`)} />
                </div>
                <div>
                  <Label>End</Label>
                  <Input type="number" min={1} max={24} value={form[`${g}_window_end`]} onChange={num(`${g}_window_end`)} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Warm-up & holiday calendar" desc="Protects a new sender's reputation and avoids emailing on public holidays.">
          <div className="grid gap-3">
            <Toggle
              checked={form.warmup_enabled}
              onChange={(v) => setForm({ ...form, warmup_enabled: v })}
              label="New-sender warm-up"
              hint={`10/day in week 1, 20 in week 2, 30 in week 3, then your daily cap. Today's cap: ${st.warmup.cap}${st.warmup.warmupWeek ? ` (week ${st.warmup.warmupWeek})` : ""}.`}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Warm-up started</Label>
                <Input type="date" value={form.warmup_started_on ?? ""} onChange={str("warmup_started_on")} disabled={!form.warmup_enabled} />
              </div>
            </div>
            <Toggle
              checked={form.skip_holidays}
              onChange={(v) => setForm({ ...form, skip_holidays: v })}
              label="Skip public holidays (India & US)"
              hint={`Next: IN ${st.holidays.INDIA.slice(0, 2).map((h) => `${h.date} ${h.name}`).join(", ")} · US ${st.holidays.US.slice(0, 2).map((h) => `${h.date} ${h.name}`).join(", ")}. India festival dates loaded through ${st.holidays.indiaFestivalsUntil}.`}
            />
            <div>
              <Label hint="all regions · YYYY-MM-DD, comma separated">Extra no-send dates</Label>
              <Input value={form.extra_blackout_dates ?? ""} onChange={str("extra_blackout_dates")} placeholder="2026-11-24, 2026-12-31" />
            </div>
            <Toggle
              checked={form.auto_resume_ooo}
              onChange={(v) => setForm({ ...form, auto_resume_ooo: v })}
              label="Auto-resume after out-of-office replies"
              hint="Continues the sequence the business day after they're back (AI reads the return date; otherwise 5 business days). At most twice per lead."
            />
          </div>
        </Section>

        <Section title="Sender identity & destinations">
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sender name</Label>
                <Input value={form.sender_name} onChange={str("sender_name")} />
              </div>
              <div>
                <Label>Sender email</Label>
                <Input value={form.sender_email} onChange={str("sender_email")} />
              </div>
            </div>
            <div>
              <Label>Portfolio base URL</Label>
              <Input value={form.portfolio_base_url} onChange={str("portfolio_base_url")} />
            </div>
            <div>
              <Label>Résumé URL</Label>
              <Input value={form.resume_url} onChange={str("resume_url")} />
            </div>
          </div>
        </Section>

        <Section title="Connections & environment">
          <StatusRow ok={st.gmailConnected} label="Gmail API" detail={st.gmailConnected ? `token from ${st.gmailTokenSource}` : st.googleClientConfigured ? "not authorised" : "client id/secret missing"} />
          <StatusRow ok={st.resendConfigured} optional label="Resend API" detail={st.resendConfigured ? "ok" : "optional · not used"} />
          <StatusRow
            ok={st.aiConfigured}
            optional
            label="AI reply triage (Groq)"
            detail={st.aiConfigured ? (st.aiModel ?? "on") : "optional · set GROQ_API_KEY"}
          />
          <StatusRow
            ok={st.telegramConfigured}
            label="Telegram alerts"
            detail={st.telegramConfigured ? `replies + digest at ${st.digestTime}` : "set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID"}
          />
          <StatusRow ok={st.cronSecretSet} label="CRON_SECRET" />
          <StatusRow ok={st.trackingSecretSet} label="TRACKING_SECRET" detail={st.trackingSecretSet ? "ok" : "falling back"} />
          <StatusRow ok={st.dashboardAuth} label="Dashboard password" detail={st.dashboardAuth ? "ok" : "OPEN — set DASHBOARD_PASSWORD"} />
          <StatusRow ok={baseUrlOk} label="APP_BASE_URL" detail={st.appBaseUrl} />
          <div className="mt-4 flex gap-2">
            {st.googleClientConfigured ? (
              <a
                href="/api/auth/google/start"
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                  st.gmailConnected ? "border-line bg-card text-fg hover:bg-raised" : "border-fg bg-fg text-bg hover:bg-zinc-200",
                )}
              >
                <Link2 className="h-3.5 w-3.5" /> {st.gmailConnected ? "Reconnect Gmail" : "Connect Gmail"}
              </a>
            ) : (
              <Button size="sm" disabled title="Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first">
                <Link2 className="h-3.5 w-3.5" /> Connect Gmail
              </Button>
            )}
            {st.telegramConfigured && (
              <Button size="sm" onClick={sendTestAlert} loading={testing}>
                <Send className="h-3.5 w-3.5" /> Send test alert
              </Button>
            )}
            {st.gmailTokenSource === "database" && (
              <Button size="sm" variant="danger" onClick={() => confirm("Remove the stored Gmail refresh token?") && save({ disconnect_gmail: true })}>
                <Unplug className="h-3.5 w-3.5" /> Disconnect
              </Button>
            )}
          </div>
          {!baseUrlOk && (
            <p className="mt-3 text-xs text-amber-300">
              {isLocal
                ? "Tracking pixels and click links point at localhost — set APP_BASE_URL to your public deployment before sending."
                : "APP_BASE_URL must start with https:// — Google rejects the Gmail sign-in redirect otherwise, and tracked links would use plain HTTP. Fix it in Vercel and redeploy."}
            </p>
          )}
        </Section>
      </div>

      <Section
        title="Portfolio telemetry snippet"
        desc={`Paste into the portfolio repo as components/PortfolioTracker.tsx and mount <PortfolioTracker /> in app/layout.tsx. Allowed origins: ${st.portfolioOrigins.join(", ")}`}
      >
        <div className="relative">
          <Button
            size="sm"
            className="absolute top-2 right-2"
            onClick={async () => {
              await navigator.clipboard.writeText(snippet);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
          </Button>
          <pre className="max-h-[420px] overflow-auto rounded-md border border-line bg-bg p-4 font-mono text-[11.5px] leading-relaxed text-muted">{snippet}</pre>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-dim">
          <Badge>POST {st.appBaseUrl}/api/track/portfolio</Badge>
          <Badge>{"{ ref, path, type: view|leave, durationSec }"}</Badge>
        </div>
      </Section>
    </div>
  );
}
