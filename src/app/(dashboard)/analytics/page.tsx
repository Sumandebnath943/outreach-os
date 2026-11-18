"use client";

import { useState } from "react";
import { usePoll } from "@/lib/client";
import type { Analytics, Rate, SegmentRow } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { ANALYTIC_TONE, TRACK_TONE, GEO_TONE, TOUCH_TONE, toneColor, type Tone } from "@/lib/theme";
import { Badge, Card } from "@/components/ui";

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "all", label: "All time" },
] as const;

/** One theme-aware hue for magnitude marks. Stage identity stays in stage labels. */
const FUNNEL_COLOR: Record<string, string> = { CONTACTED: 'active', WARM_ENGAGED: 'engaged', REPLIED: 'replied', INTERVIEWING: 'interview', OFFER_STAGE: 'offer' };
const metricTone = (label: string): Tone => /bounce/i.test(label) ? 'danger' : /click/i.test(label) ? 'warning' : /repl/i.test(label) ? 'violet' : /open|sent|email/i.test(label) ? 'info' : 'neutral';

const pct = (r: Rate | number | null) => {
  const v = typeof r === "number" || r === null ? r : r.rate;
  return v === null ? "—" : `${(v * 100).toFixed(v > 0 && v < 0.1 ? 1 : 0)}%`;
};

function Tile({ label, rate, hint, tone }: { label: string; rate: Rate; hint: string; tone: Tone }) {
  return (
    <Card className="metric-card p-4" tone={tone}>
      <div className="text-[11px] font-medium tracking-[0.12em] text-dim uppercase">{label}</div>
      <div className="tone-text mt-1 font-mono text-2xl tabular">{pct(rate)}</div>
      <div className="mt-1 font-mono text-[11px] text-dim">
        {rate.n} / {rate.d} {hint}
      </div>
    </Card>
  );
}

function RateCell({ r, tone = "neutral" }: { r: Rate; tone?: Tone }) {
  return (
    <td data-tone={tone} className="tone-text px-3 py-2 text-right font-mono whitespace-nowrap tabular">
      {pct(r)} <span className="text-[11px] text-dim">{r.d ? `${r.n}/${r.d}` : ""}</span>
    </td>
  );
}

function Table({ title, head, children }: { title: string; head: string[]; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div data-tone="info" className="tone-surface border-b border-line px-4 py-3 text-sm font-medium">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="font-mono text-[11px] tracking-wider text-dim uppercase">
            <tr className="border-b border-line">
              {head.map((h, i) => (
                <th key={h} style={{ color: toneColor(metricTone(h)) }} className={cn("px-3 py-2 font-normal", i === 0 ? "text-left" : "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </Card>
  );
}

function SegmentTable({ title, rows }: { title: string; rows: SegmentRow[] }) {
  return (
    <Table title={title} head={["Segment", "Contacted", "Emails", "Opened", "Clicked", "Replied", "Bounced"]}>
      {rows.map((r) => (
        <tr key={r.key} className="border-b border-line/60 last:border-0">
          <td className="px-3 py-2 font-mono"><Badge tone={TRACK_TONE[r.key] || GEO_TONE[r.key] || TOUCH_TONE[r.key] || "neutral"}>{r.key}</Badge></td>
          <td className="px-3 py-2 text-right font-mono tabular">{r.contacted}</td>
          <td className="px-3 py-2 text-right font-mono tabular">{r.sent}</td>
          <RateCell r={r.open} tone={ANALYTIC_TONE.open} />
          <RateCell r={r.click} tone={ANALYTIC_TONE.click} />
          <RateCell r={r.reply} tone={ANALYTIC_TONE.reply} />
          <RateCell r={r.bounce} tone={ANALYTIC_TONE.bounce} />
        </tr>
      ))}
    </Table>
  );
}

/** Counts share one scale; series keep the same meanings as metric tiles and tables. */
function DailyChart({ daily }: { daily: Analytics["daily"] }) {
  const max = Math.max(1, ...daily.flatMap(d => [d.sent, d.replies]));
  const [selected, setSelected] = useState<string | null>(null);
  const day = daily.find(d => d.day === selected);
  return <Card className="p-4" tone="info">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-medium">Daily sends &amp; replies</h2><div className="flex gap-2"><Badge tone="info">Sent</Badge><Badge tone="violet">Replies</Badge></div></div>
    <div className="mb-1 flex justify-between text-[11px] text-muted"><span>Count</span><span>{max}</span></div>
    <div className="flex h-32 items-end gap-0.5 border-b border-line" aria-label="Daily sends and replies chart">
      {daily.map(d => <button key={d.day} type="button" aria-label={`${d.day}: ${d.sent} sent, ${d.replies} replies`} aria-pressed={selected === d.day} onClick={() => setSelected(d.day)} onFocus={() => setSelected(d.day)} className="flex h-full min-w-0 flex-1 items-end justify-center gap-px rounded-sm px-px hover:bg-raised">
        <span className="w-1/2 max-w-3 rounded-t-sm" style={{ height: `${d.sent / max * 100}%`, minHeight: d.sent ? 2 : 0, background: toneColor('info') }} />
        <span className="w-1/2 max-w-3 rounded-t-sm" style={{ height: `${d.replies / max * 100}%`, minHeight: d.replies ? 2 : 0, background: toneColor('violet') }} />
      </button>)}
    </div>
    <div className="mt-1 flex justify-between text-[11px] text-muted"><span>{daily[0]?.day}</span><span>{daily.at(-1)?.day}</span></div>
    <p className="mt-3 min-h-4 text-xs text-muted" aria-live="polite">{day ? `${day.day} · ${day.sent} sent · ${day.replies} replies` : 'Select a day to inspect its counts.'}</p>
    <details className="theme-details mt-3"><summary>View daily counts as a table</summary><table className="w-full text-xs"><thead><tr className="text-left text-muted"><th className="py-1">Date</th><th className="text-right">Sent</th><th className="text-right">Replies</th></tr></thead><tbody>{daily.filter(d => d.sent || d.replies).map(d => <tr key={d.day} className="border-t border-line"><td className="py-1">{d.day}</td><td className="text-right text-info">{d.sent}</td><td className="text-right text-violet">{d.replies}</td></tr>)}</tbody></table></details>
  </Card>;
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<string>("30");
  const { data, error, loading } = usePoll<Analytics>(`/api/analytics?range=${range}`, 60_000);
  const t = data?.totals;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-5 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-dim">Rates for emails sent in the selected period. Automated opens and clicks (scanners, prefetch) are excluded.</p>
        </div>
        <div className="flex rounded-md border border-line bg-card p-0.5" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={cn("rounded px-2.5 py-1 font-mono text-[11px]", range === r.key ? "bg-accent text-accent-ink" : "text-dim hover:text-fg")}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div role="alert" className="text-sm text-danger">Could not load analytics: {error}</div>}
      {loading && !data && <div className="h-40 animate-pulse rounded-lg bg-card" />}

      {data && t && t.sent === 0 && <p data-tone="info" className="tone-surface rounded-lg border p-3 text-sm">No emails sent in this period. Rates appear once the first touches go out.</p>}

      {data && t && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Tile label="Open rate" tone={ANALYTIC_TONE.open} rate={t.open} hint="emails" />
            <Tile label="Click rate" tone={ANALYTIC_TONE.click} rate={t.click} hint="emails" />
            <Tile label="Reply rate" tone={ANALYTIC_TONE.reply} rate={t.reply} hint="leads" />
            <Tile label="Positive replies" tone={ANALYTIC_TONE.positive} rate={t.positive} hint="leads" />
            <Tile label="Portfolio visits" tone={ANALYTIC_TONE.portfolio} rate={t.portfolio} hint="leads" />
            <Tile label="Bounce rate" tone={ANALYTIC_TONE.bounce} rate={t.bounce} hint="emails" />
          </div>
          <div className="font-mono text-[11px] text-dim">
            {t.sent} emails · {t.delivered} delivered · {t.contacted} leads contacted · {t.botHitsFiltered} automated hits filtered
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Table title="Funnel (furthest stage reached)" head={["Stage", "Leads", "% of contacted"]}>
              {data.funnel.map((f) => (
                <tr key={f.stage} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2"><span style={{ color: `var(--color-stage-${FUNNEL_COLOR[f.stage] || "queued"})` }}>{f.label}</span></td>
                  <td className="px-3 py-2 text-right font-mono tabular">{f.leads}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full" style={{ width: `${(f.pctOfContacted ?? 0) * 100}%`, background: `var(--color-stage-${FUNNEL_COLOR[f.stage] || "queued"})` }} />
                      </div>
                      <span className="w-10 text-right font-mono tabular">{pct(f.pctOfContacted)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
            <DailyChart daily={data.daily} />
          </div>

          <Table title="By touch (replies credited to the last email before the reply)" head={["Touch", "Sent", "Opened", "Clicked", "Bounced", "Replies"]}>
            {data.byTouch.map((r) => (
              <tr key={r.key} className="border-b border-line/60 last:border-0">
                <td className="px-3 py-2 font-mono"><Badge tone={TRACK_TONE[r.key] || GEO_TONE[r.key] || TOUCH_TONE[r.key] || "neutral"}>{r.key}</Badge></td>
                <td className="px-3 py-2 text-right font-mono tabular">{r.sent}</td>
                <RateCell r={r.open} tone={ANALYTIC_TONE.open} />
                <RateCell r={r.click} tone={ANALYTIC_TONE.click} />
                <RateCell r={r.bounce} tone={ANALYTIC_TONE.bounce} />
                <td className="px-3 py-2 text-right font-mono tabular">{r.replies}</td>
              </tr>
            ))}
          </Table>

          <div className="grid gap-4">
            <SegmentTable title="By role track" rows={data.byTrack} />
            <SegmentTable title="By geo" rows={data.byGeo} />
          </div>

          <p className="text-[11px] leading-relaxed text-dim">
            Open rates are indicative: Apple Mail Privacy Protection preloads images, and some clients block them. Clicks, replies and portfolio visits are the
            reliable signals.
          </p>
        </>
      )}
    </div>
  );
}
