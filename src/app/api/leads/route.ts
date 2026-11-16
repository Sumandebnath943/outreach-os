import type { NextRequest } from "next/server";
import { db, getSettings, logEvent, must, PAGE_SIZE, updateLead } from "@/lib/server/db";
import { fail, ok, readJson, route } from "@/lib/server/http";
import { resumeStageFor, stageSideEffects } from "@/lib/funnel";
import { cleanMultiline, FIELD_LIMITS, normalizeLead, sanitizeUrl } from "@/lib/ingest";
import { FUNNEL_STAGES, GEO_REGIONS, ROLE_TRACKS, type FunnelStage, type Lead } from "@/lib/types";
import { UUID_RE } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MAX_LIST = 10_000;

/** GET /api/leads?stage=WARM_ENGAGED&q=acme&limit=500 — pages past the PostgREST row cap. */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(MAX_LIST, Math.max(1, Math.floor(Number(sp.get("limit")) || MAX_LIST)));
  const stage = sp.get("stage");
  const search = sp.get("q")?.trim().slice(0, 100);
  // PostgREST filter syntax uses , ( ) . : * \ " as delimiters/wildcards — strip them from user input.
  const needle = search?.replace(/[%,().:*\\"]/g, " ").trim();

  const leads: Lead[] = [];
  for (let from = 0; from < limit; from += PAGE_SIZE) {
    let q = db()
      .from("leads")
      .select("*")
      .order("updated_at", { ascending: false })
      .order("id")
      .range(from, Math.min(from + PAGE_SIZE, limit) - 1);
    if (stage && (FUNNEL_STAGES as readonly string[]).includes(stage)) q = q.eq("funnel_stage", stage);
    if (needle) q = q.or(`email.ilike.%${needle}%,company_name.ilike.%${needle}%,first_name.ilike.%${needle}%,last_name.ilike.%${needle}%`);
    const page = must(await q, "list leads") as Lead[];
    leads.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return ok({ leads });
});

/** POST /api/leads — create a single lead (manual entry). */
export const POST = route(async (req: Request) => {
  const body = await readJson(req);
  const n = normalizeLead(body);
  if (!n.ok) return fail(n.error);
  const existing = await db().from("leads").select("id, funnel_stage").eq("email", n.lead.email).maybeSingle();
  if (existing.data) return fail(`Lead ${n.lead.email} already exists (${existing.data.funnel_stage})`, 409);
  const res = await db()
    .from("leads")
    .insert({ ...n.lead, next_touch_due_at: new Date().toISOString() })
    .select("*")
    .single();
  const lead = must(res, "create lead") as Lead;
  await logEvent(lead.id, "STAGE_CHANGE", { from: null, to: "LEAD_QUEUED", reason: "manual_create" });
  return ok({ lead }, { status: 201 });
});

/** Single-line text fields editable from the dossier, with their max length. */
const TEXT_FIELDS: Partial<Record<keyof Lead, number>> = {
  first_name: FIELD_LIMITS.first_name,
  last_name: FIELD_LIMITS.last_name,
  company_name: FIELD_LIMITS.company_name,
  job_title: FIELD_LIMITS.job_title,
  target_role_opening: FIELD_LIMITS.target_role_opening,
  custom_icebreaker: FIELD_LIMITS.custom_icebreaker,
  sub_stage: 40,
  reply_sentiment: 40,
};

/** PATCH /api/leads  { id, funnel_stage?, sub_stage?, notes?, approval_status?, action?, …details } */
export const PATCH = route(async (req: Request) => {
  const body = await readJson<Record<string, unknown> & { id?: string; action?: string; funnel_stage?: string }>(req);
  if (!body.id || !UUID_RE.test(body.id)) return fail("id required");
  const current = must(await db().from("leads").select("*").eq("id", body.id).single(), "load lead") as Lead;

  const patch: Partial<Lead> = {};
  const set = (k: keyof Lead, v: unknown) => ((patch as Record<string, unknown>)[k] = v);
  for (const [k, max] of Object.entries(TEXT_FIELDS) as [keyof Lead, number][]) {
    if (!(k in body)) continue;
    const v = body[k] == null ? "" : String(body[k]).replace(/\s+/g, " ").trim().slice(0, max);
    set(k, v || null);
  }
  if ("notes" in body) patch.notes = cleanMultiline(body.notes, FIELD_LIMITS.notes);
  for (const k of ["linkedin_url", "company_website"] as const) {
    if (!(k in body)) continue;
    const raw = body[k] == null ? "" : String(body[k]).trim();
    const url = sanitizeUrl(raw);
    if (raw && !url) return fail(`${k} must be an http(s) URL`);
    patch[k] = url;
  }
  if ("geo_region" in body) {
    if (!(GEO_REGIONS as readonly unknown[]).includes(body.geo_region)) return fail("invalid geo_region");
    patch.geo_region = body.geo_region as Lead["geo_region"];
  }
  if ("role_track" in body) {
    if (!(ROLE_TRACKS as readonly unknown[]).includes(body.role_track)) return fail("invalid role_track");
    patch.role_track = body.role_track as Lead["role_track"];
  }
  if ("approval_status" in body) {
    if (!["PENDING", "APPROVED", "PAUSED"].includes(String(body.approval_status))) return fail("invalid approval_status");
    patch.approval_status = body.approval_status as Lead["approval_status"];
  }
  if ("reengage_at" in body) {
    if (body.reengage_at == null || body.reengage_at === "") patch.reengage_at = null;
    else {
      const d = new Date(String(body.reengage_at));
      if (Number.isNaN(d.getTime())) return fail("invalid reengage_at");
      patch.reengage_at = d.toISOString();
    }
  }
  if ("first_name" in patch && !patch.first_name) patch.first_name = "Team";
  if ("company_name" in patch && !patch.company_name) return fail("company_name cannot be empty");

  if (body.action === "resume_sequence") {
    if (current.current_touch >= 4) return fail("All 4 touches already sent");
    Object.assign(patch, {
      funnel_stage: resumeStageFor(current),
      sequence_active: true,
      sub_stage: null,
      next_touch_due_at: new Date().toISOString(),
      approval_status: "PENDING",
    } satisfies Partial<Lead>);
  } else if (body.funnel_stage && body.funnel_stage !== current.funnel_stage) {
    if (!(FUNNEL_STAGES as readonly string[]).includes(body.funnel_stage)) return fail("invalid funnel_stage");
    const settings = await getSettings();
    // side effects see the incoming sub_stage, so "CLOSED_ARCHIVE + REJECTED" style moves are kept
    Object.assign(patch, stageSideEffects({ ...current, ...patch }, body.funnel_stage as FunnelStage, settings));
  }

  if (!Object.keys(patch).length) return ok({ lead: current });
  if (patch.funnel_stage && patch.funnel_stage !== current.funnel_stage) {
    // a human moved the card — drop any stale approval drafts
    await db().from("email_logs").delete().eq("lead_id", current.id).eq("status", "QUEUED_FOR_APPROVAL");
  }
  const lead = await updateLead(current, patch, body.action ?? "manual");
  return ok({ lead });
});

/** DELETE /api/leads?id=… */
export const DELETE = route(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !UUID_RE.test(id)) return fail("id required");
  must(await db().from("leads").delete().eq("id", id).select("id"), "delete lead");
  return ok({ deleted: id });
});
