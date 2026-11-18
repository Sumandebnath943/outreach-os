import { countSentSince, db, getSettings } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { isGmailConfigured } from "@/lib/server/gmail";
import { ok, route } from "@/lib/server/http";
import { effectiveDailyLimit, SENDABLE_STAGES } from "@/lib/funnel";
import { startOfTodayIn } from "@/lib/schedule";
import { FUNNEL_STAGES, type DashboardStats, type FunnelStage } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const settings = await getSettings();
  const cap = effectiveDailyLimit(settings, new Date(), env.ownerTimezone());
  const horizon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  // Exact counts via head requests — unaffected by the PostgREST 1000-row response cap.
  const leads = () => db().from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null);
  const exact = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const res = await q;
    if (res.error) throw new Error(`stats: ${res.error.message}`);
    return res.count ?? 0;
  };

  const [stageCounts, active, pending, sentToday] = await Promise.all([
    Promise.all(FUNNEL_STAGES.map((s) => exact(leads().eq("funnel_stage", s)))),
    exact(leads().eq("sequence_active", true).in("funnel_stage", SENDABLE_STAGES)),
    exact(
      leads()
        .eq("sequence_active", true)
        .lt("current_touch", 4)
        .in("funnel_stage", SENDABLE_STAGES)
        .eq("approval_status", "PENDING")
        .eq('email_check_status', 'PASSED')
        .lte("next_touch_due_at", horizon),
    ),
    countSentSince(startOfTodayIn(env.ownerTimezone()).toISOString()),
  ]);

  const byStage = Object.fromEntries(FUNNEL_STAGES.map((s, i) => [s, stageCounts[i]])) as Record<FunnelStage, number>;
  const since = startOfTodayIn(env.ownerTimezone()).toISOString();
  const [testSends, bounced] = await Promise.all([
    exact(db().from("email_logs").select("id", { count: "exact", head: true }).in("status", ["SENT", "BOUNCED"]).eq("is_test", true).gte("sent_at", since)),
    exact(db().from("email_logs").select("id", { count: "exact", head: true }).eq("status", "BOUNCED").gte("sent_at", since)),
  ]);
  const stats: DashboardStats = {
    quotaBreakdown: { test: testSends, outreach: sentToday - testSends, bounced },
    total: stageCounts.reduce((a, b) => a + b, 0),
    activeInSequence: active,
    warm: byStage.WARM_ENGAGED,
    triage: byStage.REPLIED_TRIAGE,
    interviewing: byStage.INTERVIEWING,
    sentToday,
    dailyLimit: cap.cap,
    warmupWeek: cap.warmupWeek,
    executionMode: settings.execution_mode,
    sendProvider: settings.send_provider,
    pendingApprovals: pending,
    nextDispatchAt: settings.next_dispatch_at,
    lastQueueRunAt: settings.last_queue_run_at,
    gmailConnected: isGmailConfigured(settings),
    byStage,
  };
  return ok(stats);
});
