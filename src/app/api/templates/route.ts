import type { NextRequest } from "next/server";
import { db, must } from "@/lib/server/db";
import { fail, ok, readJson, route } from "@/lib/server/http";
import { BRANCH_VARIANTS, ROLE_TRACKS, type SequenceTemplate } from "@/lib/types";
import { UUID_RE } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const res = await db()
    .from("sequence_templates")
    .select("*")
    .order("role_track")
    .order("touch_number")
    .order("branch_variant");
  return ok({ templates: must(res, "list templates") as SequenceTemplate[] });
});

/** PUT /api/templates — upsert one template (or { templates: [...] }) keyed by (role_track, touch, variant). */
export const PUT = route(async (req: Request) => {
  const body = await readJson<Partial<SequenceTemplate> & { templates?: Partial<SequenceTemplate>[] }>(req);
  const items = Array.isArray(body.templates) ? body.templates : [body];
  const rows: Omit<SequenceTemplate, "id" | "created_at">[] = [];

  for (const t of items) {
    if (!t.role_track || !(ROLE_TRACKS as readonly string[]).includes(t.role_track)) return fail("invalid role_track");
    if (![1, 2, 3, 4].includes(Number(t.touch_number))) return fail("touch_number must be 1-4");
    const variant = t.branch_variant ?? "STANDARD";
    if (!(BRANCH_VARIANTS as readonly string[]).includes(variant)) return fail("invalid branch_variant");
    if (Number(t.touch_number) === 2 && variant === "STANDARD") return fail("Touch 2 uses WARM / COLD variants");
    if (Number(t.touch_number) !== 2 && variant !== "STANDARD") return fail("Only Touch 2 branches into WARM / COLD");
    if (typeof t.subject_template !== "string" || typeof t.body_template !== "string" || !t.subject_template.trim() || !t.body_template.trim())
      return fail("subject and body are required");
    if (t.subject_template.length > 300 || t.body_template.length > 20_000) return fail("subject or body is too long");
    const wait = Number(t.wait_business_days ?? 0);
    if (!Number.isInteger(wait) || wait < 0 || wait > 60) return fail("wait_business_days must be 0-60");
    rows.push({
      role_track: t.role_track,
      touch_number: Number(t.touch_number) as SequenceTemplate["touch_number"],
      branch_variant: variant,
      subject_template: t.subject_template.replace(/[\r\n]+/g, " ").trim(),
      body_template: t.body_template.replace(/\r\n/g, "\n").trim(),
      wait_business_days: Number(t.touch_number) === 1 ? 0 : wait,
      same_thread: Number(t.touch_number) === 1 ? false : t.same_thread !== false,
    });
  }

  const res = await db()
    .from("sequence_templates")
    .upsert(rows, { onConflict: "role_track,touch_number,branch_variant" })
    .select("*");
  const saved = must(res, "save templates") as SequenceTemplate[];

  // The wait before Touch 2 is scheduled before the warm/cold branch is known, so both
  // branches of a track must share it — keep the sibling variant in sync.
  for (const r of rows.filter((x) => x.touch_number === 2)) {
    must(
      await db()
        .from("sequence_templates")
        .update({ wait_business_days: r.wait_business_days })
        .eq("role_track", r.role_track)
        .eq("touch_number", 2)
        .neq("branch_variant", r.branch_variant)
        .select("id"),
      "sync touch 2 wait",
    );
  }
  return ok({ templates: saved });
});

/** DELETE /api/templates?id=… — removes a role-track override (HYBRID_DEFAULT base templates are protected). */
export const DELETE = route(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) return fail("id required");
  const t = must(await db().from("sequence_templates").select("*").eq("id", id).single(), "load template") as SequenceTemplate;
  if (t.role_track === "HYBRID_DEFAULT") return fail("HYBRID_DEFAULT templates are the fallback base and cannot be deleted");
  must(await db().from("sequence_templates").delete().eq("id", id).select("id"), "delete template");
  return ok({ deleted: id });
});
