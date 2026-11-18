import { db, getSettings, must } from "@/lib/server/db";
import { checkInbound, gmailClient } from "@/lib/server/gmail";
import { fail, ok, route } from "@/lib/server/http";
import type { Lead } from "@/lib/types";
import { UUID_RE } from "@/lib/utils";
export const maxDuration = 30;
/** Read the original failure notice on demand; never run the sequencer or alter the lead. */
export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("Invalid lead");
  const lead = must(await db().from("leads").select("*").eq("id", id).maybeSingle(), "load lead") as Lead | null;
  if (!lead) return fail("Lead not found", 404);
  if (lead.sub_stage !== "BOUNCED") return fail("This lead has no recorded bounce");
  const settings = await getSettings();
  const gmail = gmailClient(settings);
  if (!gmail) return fail("Connect Gmail to read the original delivery notice", 409);
  const logs = must(await db().from("email_logs").select("sent_at").eq("lead_id", id).in("status", ["SENT", "BOUNCED"]).order("sent_at").limit(1), "first send") as { sent_at: string }[];
  const since = new Date(Date.parse(logs[0]?.sent_at ?? lead.created_at) - 600_000);
  const result = await checkInbound(gmail, lead, settings.sender_email, since);
  return ok({ reason: result.kind === "BOUNCE" ? result.reason || result.snippet : "No delivery notice found. Open the thread in Gmail for the original message." });
});
