import type { NextRequest } from "next/server";
import { db, must, PAGE_SIZE } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { ok, route } from "@/lib/server/http";
import { computeAnalytics, type AnalyticsEvent, type AnalyticsLead, type AnalyticsLog } from "@/lib/analytics";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RANGES: Record<string, number | null> = { "7": 7, "30": 30, "90": 90, all: null };
const MAX_ROWS = 50_000;

/** Reads every row a query matches, PAGE_SIZE at a time (PostgREST caps single responses). */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, ctx: string) {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const batch = must(await page(from, from + PAGE_SIZE - 1), ctx) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

/** GET /api/analytics?range=7|30|90|all — open, click, reply, bounce rates, funnel and breakdowns. */
export const GET = route(async (req: NextRequest) => {
  const key = req.nextUrl.searchParams.get("range") ?? "30";
  const days = key in RANGES ? RANGES[key] : 30;
  const to = new Date();
  const from = days ? new Date(to.getTime() - days * 86_400_000) : null;
  const since = from?.toISOString() ?? "1970-01-01T00:00:00.000Z";

  const [logs, events, leads] = await Promise.all([
    readAll<AnalyticsLog>(
      (a, b) =>
        db()
          .from("email_logs")
          .select("id, lead_id, touch_number, branch_variant, status, sent_at")
          .in("status", ["SENT", "BOUNCED"])
          .gte("sent_at", since)
          .order("sent_at")
          .order("id")
          .range(a, b),
      "analytics logs",
    ),
    readAll<AnalyticsEvent>(
      (a, b) =>
        db()
          .from("tracking_events")
          .select("lead_id, email_log_id, event_type, metadata, created_at")
          .gte("created_at", since)
          .order("created_at")
          .order("id")
          .range(a, b),
      "analytics events",
    ),
    readAll<AnalyticsLead>(
      (a, b) => db().from("leads").select("id, funnel_stage, sub_stage, role_track, geo_region").is("deleted_at", null).order("id").range(a, b),
      "analytics leads",
    ),
  ]);

  return ok(computeAnalytics({ leads, logs, events }, { from, to, tz: env.ownerTimezone() }));
});
