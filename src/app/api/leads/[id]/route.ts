import type { NextRequest } from "next/server";
import { db, must } from "@/lib/server/db";
import { fail, ok, route } from "@/lib/server/http";
import { stripImages } from "@/lib/render";
import type { EmailLog, Lead, TrackingEvent } from "@/lib/types";
import { UUID_RE } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/leads/:id — full dossier: lead, sent thread, telemetry timeline. */
export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("invalid id");
  const [lead, logs, events] = await Promise.all([
    db().from("leads").select("*").eq("id", id).maybeSingle(),
    db().from("email_logs").select("*").eq("lead_id", id).order("sent_at", { ascending: true }),
    db().from("tracking_events").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(300),
  ]);
  if (!lead.data) return fail("lead not found", 404);
  return ok({
    lead: lead.data as Lead,
    // pixels stripped so viewing the dossier never registers a fake open
    emails: (must(logs, "load logs") as EmailLog[]).map((l) => ({ ...l, body_html: stripImages(l.body_html) })),
    events: must(events, "load events") as TrackingEvent[],
  });
});
