import type { NextRequest } from "next/server";
import { db, getSettings, must } from "@/lib/server/db";
import { fail, ok, route } from "@/lib/server/http";
import { stripImages } from "@/lib/render";
import type { EmailLog, Lead, TrackingEvent } from "@/lib/types";
import { UUID_RE } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/leads/:id — full dossier: lead, sent thread, telemetry timeline. */
export const GET = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("invalid id");
  const eventsPage = Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get("eventsPage")) || 1));
  const emailsPage = Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get("emailsPage")) || 1));
  const [lead, logs, events] = await Promise.all([
    db().from("leads").select("*").eq("id", id).maybeSingle(),
    db().from("email_logs").select("*", { count: "exact" }).eq("lead_id", id).order("sent_at", { ascending: true }).order("id").range((emailsPage - 1) * 25, emailsPage * 25 - 1),
    db().from("tracking_events").select("*", { count: "exact" }).eq("lead_id", id).order("created_at", { ascending: false }).order("id").range((eventsPage - 1) * 25, eventsPage * 25 - 1),
  ]);
  if (!lead.data) return fail("lead not found", 404);
  const settings = await getSettings();
  const [reply, failure] = await Promise.all([
    db().from("tracking_events").select("*").eq("lead_id", id).eq("event_type", "REPLY_RECEIVED").order("created_at", { ascending: false }).limit(1),
    db().from("email_logs").select("error").eq("lead_id", id).in("status", ["BOUNCED", "FAILED"]).order("sent_at", { ascending: false }).limit(1),
  ]);
  return ok({
    latestReply: (must(reply, "latest reply") as TrackingEvent[])[0] ?? null,
    deliveryFailure: (must(failure, "delivery failure") as { error: string | null }[])[0]?.error ?? null,
    eventsTotal: events.count ?? 0, emailsTotal: logs.count ?? 0,
    lead: lead.data as Lead,
    /** Gmail account the threads live in — used for "Open in Gmail" links. */
    mailbox: settings.sender_email,
    // pixels stripped so viewing the dossier never registers a fake open
    emails: (must(logs, "load logs") as EmailLog[]).map((l) => ({ ...l, body_html: stripImages(l.body_html) })),
    events: must(events, "load events") as TrackingEvent[],
  });
});
