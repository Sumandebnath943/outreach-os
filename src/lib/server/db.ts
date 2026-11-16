import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { EventType, Lead, SystemSettings } from "../types";

let client: SupabaseClient | null = null;

/** Service-role client. Server-only — RLS is enabled with no policies, so the anon key can read nothing. */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function must<T>(res: { data: T | null; error: { message: string } | null }, ctx: string): T {
  if (res.error) throw new Error(`${ctx}: ${res.error.message}`);
  return res.data as T;
}

/** PostgREST caps a single response (1000 rows by default) — page through for larger reads. */
export const PAGE_SIZE = 1000;

export async function getSettings(): Promise<SystemSettings> {
  const res = await db().from("system_settings").select("*").eq("id", 1).single();
  return must(res, "load settings") as SystemSettings;
}

/** Emails that actually left the building since `sinceIso` (later bounces still consumed quota). */
export async function countSentSince(sinceIso: string): Promise<number> {
  const res = await db()
    .from("email_logs")
    .select("id", { count: "exact", head: true })
    .in("status", ["SENT", "BOUNCED"])
    .gte("sent_at", sinceIso);
  if (res.error) throw new Error(`count sent: ${res.error.message}`);
  return res.count ?? 0;
}

export async function logEvent(
  leadId: string,
  type: EventType,
  metadata: Record<string, unknown> = {},
  emailLogId: string | null = null,
) {
  const insert = (logId: string | null) =>
    db().from("tracking_events").insert({ lead_id: leadId, event_type: type, metadata, email_log_id: logId });
  let { error } = await insert(emailLogId);
  // The referenced email log may not exist (yet) — keep the event, drop the link.
  if (error?.code === "23503" && emailLogId) ({ error } = await insert(null));
  if (error) console.error("[events] insert failed", error.message);
}

/**
 * Updates a lead and records a STAGE_CHANGE event when the funnel stage moves.
 * `patch` may contain any lead columns.
 */
export async function updateLead(
  lead: Pick<Lead, "id" | "funnel_stage">,
  patch: Partial<Lead>,
  reason?: string,
): Promise<Lead> {
  const res = await db().from("leads").update(patch).eq("id", lead.id).select("*").single();
  const updated = must(res, "update lead") as Lead;
  if (patch.funnel_stage && patch.funnel_stage !== lead.funnel_stage) {
    await logEvent(lead.id, "STAGE_CHANGE", {
      from: lead.funnel_stage,
      to: patch.funnel_stage,
      sub_stage: patch.sub_stage ?? null,
      reason: reason ?? "manual",
    });
  }
  return updated;
}
