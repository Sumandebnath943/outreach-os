"use client";

import { useState } from "react";
import { usePoll } from "@/lib/client";
import type { Analytics, Rate, SegmentRow } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Card, Empty } from "@/components/ui";

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "all", label: "All time" },
] as const;

/** Single sequential hue for magnitude marks — validated against the #121215 card surface. */
const BAR = "#0284c7";

const pct = (r: Rate | number | null) => {
  const v = typeof r === "number" || r === null ? r : r.rate;
  return v === null ? "—" : `${(v * 100).toFixed(v > 0 && v < 0.1 ? 1 : 0)}%`;
};

function Tile({ label, rate, hint }: { label: string; rate: Rate; hint: string }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] font-medium tracking-[0.12em] text-dim uppercase">{label}</div>
      <div className="mt-1 font-mono text-2xl tabular">{pct(rate)}</div>
      <div className="mt-1 font-mono text-[11px] text-dim">
        {rate.n} / {rate.d} {hint}
      </div>
    </Card>
  );
}

function RateCell({ r }: { r: Rate }) {
  return (
    <td className="px-3 py-2 text-right font-mono whitespace-nowrap tabular">
      {pct(r)} <span className="text-[10px] text-dim">{r.d ? `${r.n}/${r.d}` : ""}</span>
    </td>
  );
}

function Table({ title, head, children }: { title: string; head: string[]; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3 text-sm font-medium">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="font-mono text-[10px] tracking-wider text-dim uppercase">
            <tr className="border-b border-line">
              {head.map((h, i) => (
                <th key={h} className={cn("px-3 py-2 font-normal", i === 0 ? "text-left" : "text-right")}>
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
          <td className="px-3 py-2 font-mono">{r.key}</td>
          <td className="px-3 py-2 text-right font-mono tabular">{r.contacted}</td>
          <td className="px-3 py-2 text-right font-mono tabular">{r.sent}</td>
          <RateCell r={r.open} />
          <RateCell r={r.click} />
          <RateCell r={r.reply} />
          <RateCell r={r.bounce} />
        </tr>
      ))}
    </Table>
  );
}

/** Emails sent per day — single series, so no legend; the title names it. Hover shows the day's numbers. */
function DailyChart({ daily }: { daily: Analytics["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.sent));
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-sm font-medium">Emails sent per day</div>
        <div className="font-mono text-[10px] text-dim">max {max}</div>
      </div>
      <div className="relative flex h-32 items-end gap-[2px] border-b border-line" role="img" aria-label="Bar chart of emails sent per day">
        {daily.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-6 rounded-t-[4px]"
              style={{ height: `${(d.sent / max) * 100}%`, minHeight: d.sent ? 2 : 0, background: BAR }}
            />
            <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded border border-line bg-raised px-2 py-1 font-mono text-[10px] whitespace-nowrap text-fg group-hover:block">
              {d.day} · {d.sent} sent · {d.replies} {d.replies === 1 ? "reply" : "replies"}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-dim">
        <span>{daily[0]?.day}</span>
        <span>{daily.at(-1)?.day}</span>
      </div>
      <details className="mt-3 text-xs text-dim">
        <summary className="cursor-pointer hover:text-fg">View as table</summary>
        <table className="mt-2 w-full font-mono text-[11px]">
          <tbody>
            {daily
              .filter((d) => d.sent || d.replies)
              .map((d) => (
                <tr key={d.day} className="border-b border-line/60">
                  <td className="py-1">{d.day}</td>
                  <td className="py-1 text-right tabular">{d.sent} sent</td>
                  <td className="py-1 text-right tabular">{d.replies} replies</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
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
              className={cn("rounded px-2.5 py-1 font-mono text-[11px]", range === r.key ? "bg-raised text-fg" : "text-dim hover:text-fg")}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-sm text-rose-700">Could not load analytics: {error}</div>}
      {loading && !data && <div className="h-40 animate-pulse rounded-lg bg-card" />}

      {data && t && t.sent === 0 && <Empty title="No emails sent in this period">Rates appear once the first touches go out.</Empty>}

      {data && t && t.sent > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Tile label="Open rate" rate={t.open} hint="emails" />
            <Tile label="Click rate" rate={t.click} hint="emails" />
            <Tile label="Reply rate" rate={t.reply} hint="leads" />
            <Tile label="Positive replies" rate={t.positive} hint="leads" />
            <Tile label="Portfolio visits" rate={t.portfolio} hint="leads" />
            <Tile label="Bounce rate" rate={t.bounce} hint="emails" />
          </div>
          <div className="font-mono text-[11px] text-dim">
            {t.sent} emails · {t.delivered} delivered · {t.contacted} leads contacted · {t.botHitsFiltered} automated hits filtered
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Table title="Funnel (furthest stage reached)" head={["Stage", "Leads", "% of contacted"]}>
              {data.funnel.map((f) => (
                <tr key={f.stage} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2">{f.label}</td>
                  <td className="px-3 py-2 text-right font-mono tabular">{f.leads}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full" style={{ width: `${(f.pctOfContacted ?? 0) * 100}%`, background: BAR }} />
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
                <td className="px-3 py-2 font-mono">{r.key}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{r.sent}</td>
                <RateCell r={r.open} />
                <RateCell r={r.click} />
                <RateCell r={r.bounce} />
                <td className="px-3 py-2 text-right font-mono tabular">{r.replies}</td>
              </tr>
            ))}
          </Table>

          <div className="grid gap-4 lg:grid-cols-2">
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
