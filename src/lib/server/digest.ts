import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { countSentSince, db, must } from "./db";
import { env } from "./env";
import { isTelegramConfigured, sendTelegram } from "./telegram";
import { SENDABLE_STAGES } from "../funnel";
import { dossierUrl, formatDigest, type DigestLead } from "../notify";
import { startOfTodayIn } from "../schedule";
import type { Lead, SystemSettings } from "../types";

const person = (l: Pick<Lead, "first_name" | "last_name">) => [l.first_name, l.last_name].filter(Boolean).join(" ");

/**
 * Sends the morning Telegram digest once per day, on the first worker run after DIGEST_TIME
 * (owner timezone). The day is claimed atomically, so overlapping runs never send it twice.
 * Returns true when a digest went out.
 */
export async function maybeSendDigest(settings: SystemSettings, now = new Date()): Promise<boolean> {
  if (!isTelegramConfigured()) return false;
  const tz = env.ownerTimezone();
  if (formatInTimeZone(now, tz, "HH:mm") < env.digestTime()) return false;
  const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
  if ((settings.last_digest_on ?? "") >= today) return false;

  const claim = await db().from("system_settings").update({ last_digest_on: today }).eq("id", 1).lt("last_digest_on", today).select("id");
  if (!(must(claim, "claim digest") as { id: number }[]).length) return false;

  const app = env.appBaseUrl();
  const todayStart = startOfTodayIn(tz, now);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const endOfToday = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const head = { count: "exact" as const, head: true };

  const [triage, warm, due, interviewing, sinceYesterday, sinceToday] = await Promise.all([
    db().from("leads").select("*", head).eq("funnel_stage", "REPLIED_TRIAGE"),
    db().from("leads").select("*", head).eq("funnel_stage", "WARM_ENGAGED").eq("sequence_active", true),
    (() => {
      let q = db()
        .from("leads")
        .select("id", head)
        .eq("sequence_active", true)
        .lt("current_touch", 4)
        .in("funnel_stage", SENDABLE_STAGES)
        .lte("next_touch_due_at", endOfToday);
      q = settings.execution_mode === "APPROVAL_GATE" ? q.eq("approval_status", "PENDING") : q.neq("approval_status", "PAUSED");
      return q;
    })(),
    db().from("leads").select("id", head).eq("funnel_stage", "INTERVIEWING"),
    countSentSince(yesterdayStart.toISOString()),
    countSentSince(todayStart.toISOString()),
  ]);
  const [triageRows, warmRows] = await Promise.all([
    db().from("leads").select("*").eq("funnel_stage", "REPLIED_TRIAGE").order("replied_at", { ascending: false, nullsFirst: false }).limit(8),
    db().from("leads").select("*").eq("funnel_stage", "WARM_ENGAGED").eq("sequence_active", true).order("last_engaged_at", { ascending: false, nullsFirst: false }).limit(3),
  ]);
  const toDigest = (l: Lead, withSentiment: boolean): DigestLead => ({
    company: l.company_name,
    person: person(l),
    sentiment: withSentiment ? l.reply_sentiment : null,
    link: dossierUrl(app, l.id),
  });

  return sendTelegram(
    formatDigest({
      now,
      tz,
      mode: settings.execution_mode,
      triage: (must(triageRows, "digest triage") as Lead[]).map((l) => toDigest(l, true)),
      triageTotal: triage.count ?? 0,
      dueToday: due.count ?? 0,
      warm: (must(warmRows, "digest warm") as Lead[]).map((l) => toDigest(l, false)),
      warmTotal: warm.count ?? 0,
      interviewing: interviewing.count ?? 0,
      sentYesterday: sinceYesterday - sinceToday,
      dailyLimit: settings.daily_send_limit,
      approvalsLink: `${app}/approvals`,
      analyticsLink: `${app}/analytics`,
    }),
  );
}
