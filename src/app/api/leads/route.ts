import type { NextRequest } from "next/server";
import { db, getSettings, logEvent, must, updateLead } from "@/lib/server/db";
import { filtersFrom, leadQuery, pagination, suppression } from "@/lib/server/lead-query";
import Papa from "papaparse";
import { fail, ok, readJson, route } from "@/lib/server/http";
import { loadTemplates } from "@/lib/server/sequencer";
import { resumeDueAt, resumeStageFor, stageSideEffects, waitFor } from "@/lib/funnel";
import { cleanMultiline, FIELD_LIMITS, normalizeLead, sanitizeUrl } from "@/lib/ingest";
import { FUNNEL_STAGES, GEO_REGIONS, ROLE_TRACKS, type FunnelStage, type Lead } from "@/lib/types";
import { UUID_RE } from "@/lib/utils";
import { addressProblem } from '@/lib/email-check';

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/leads?stage=WARM_ENGAGED&q=acme&limit=500 — pages past the PostgREST row cap. */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const filters = filtersFrom(sp);
  const p = pagination(sp);
  if (sp.get("export") === "true") {
    const rows: Lead[] = [];
    for (let from = 0; ; from += 1000) {
      const batch = must(await leadQuery(filters).order("id").range(from, from + 999), "export leads") as unknown as Lead[];
      rows.push(...batch);
      if (batch.length < 1000) break;
    }
    return new Response(Papa.unparse(rows, { escapeFormulae: true }), { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="outreach-leads.csv"' } });
  }
  const sort = sp.get("sort");
  const column = sort === "company" ? "company_name" : sort === "created" ? "created_at" : sort === "due" ? "next_touch_due_at" : "updated_at";
  const res = await leadQuery(filters).order(column, { ascending: sort === "company" || sort === "due", nullsFirst: false }).order("id").range(p.from, p.to);
  return ok({ leads: must(res, "list leads"), total: res.count ?? 0, page: p.page, pageSize: p.pageSize });
});

/** POST /api/leads — create a single lead (manual entry). */
export const POST = route(async (req: Request) => {
  const body = await readJson(req);
  const n = normalizeLead(body);
  if (!n.ok) return fail(n.error);
  const blocked = await suppression(n.lead.email);
  if (blocked) return fail(`This address is blocked: ${blocked}`, 409);
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
  if (current.deleted_at) return fail("This lead is in Trash. Restore it from Leads first.", 409);

  const patch: Partial<Lead> = {};
  if ('email' in body) {
    if (current.current_touch > 0) return fail('The address cannot change after outreach starts; create a new lead to preserve message history', 409);
    const email = String(body.email || '').trim().toLowerCase();
    const problem = addressProblem(email);
    if (problem) return fail(problem);
    const blocked = await suppression(email);
    if (blocked) return fail(`This address is blocked: ${blocked}`, 409);
    patch.email = email;
  }
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
    const blocked = await suppression(current.email);
    if (blocked) return fail(`This address is blocked: ${blocked}`, 409);
    if (current.current_touch >= 4) return fail("All 4 touches already sent");
    const [templates, lastSent, settings] = await Promise.all([
      loadTemplates(),
      db()
        .from("email_logs")
        .select("sent_at")
        .eq("lead_id", current.id)
        .in("status", ["SENT", "BOUNCED"])
        .order("sent_at", { ascending: false })
        .limit(1),
      getSettings(),
    ]);
    const lastAt = (lastSent.data as { sent_at: string }[] | null)?.[0]?.sent_at;
    const due = resumeDueAt(
      lastAt ? new Date(lastAt) : null,
      waitFor(templates, current.role_track, current.current_touch + 1),
      current.geo_region,
      new Date(),
      settings,
    );
    Object.assign(patch, {
      funnel_stage: resumeStageFor(current),
      sequence_active: true,
      sub_stage: null,
      next_touch_due_at: due.toISOString(),
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
  must(await db().from("leads").update({ deleted_at: new Date().toISOString(), sequence_active: false, approval_status: "PAUSED", next_touch_due_at: null, reengage_at: null }).eq("id", id).select("id"), "trash lead");
  return ok({ deleted: id });
});
