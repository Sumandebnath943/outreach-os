import { db, must } from "@/lib/server/db";
import { collectIds, filtersFrom, leadQuery } from "@/lib/server/lead-query";
import { fail, ok, readJson, route } from "@/lib/server/http";
import { UUID_RE } from "@/lib/utils";
export const maxDuration = 60;

export const POST = route(async (req: Request) => {
  const body = await readJson<{ action?: string; ids?: string[]; allMatching?: boolean; filters?: Record<string, string> }>(req);
  if (!["pause", "unpause", "trash", "restore", "delete", "archive"].includes(body.action ?? "")) return fail("Invalid action");
  const filters = filtersFrom(new URLSearchParams(body.filters));
  const trash = body.action === "restore" || body.action === "delete";
  const ids = body.allMatching
    ? await collectIds((a, b) => leadQuery({ ...filters, trash: String(trash) }, "id").order("id").range(a, b))
    : [...new Set(body.ids ?? [])];
  if (!body.allMatching && (ids.length > 1000 || ids.some(id => !UUID_RE.test(id)))) return fail("Select at most 1,000 valid lead IDs or use all matching");
  let updated = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const table = db().from("leads");
    const now = new Date().toISOString();
    const patch = body.action === "trash" ? { deleted_at: now, sequence_active: false, approval_status: "PAUSED", next_touch_due_at: null, reengage_at: null }
      : body.action === "restore" ? { deleted_at: null, sequence_active: false, approval_status: "PAUSED", next_touch_due_at: null }
      : body.action === "archive" ? { funnel_stage: "CLOSED_ARCHIVE", sub_stage: "WITHDRAWN", archived_at: now, sequence_active: false, next_touch_due_at: null, reengage_at: null }
      : { approval_status: body.action === "pause" ? "PAUSED" : "PENDING" };
    let q = body.action === "delete" ? table.delete() : table.update(patch);
    q = q.in("id", chunk);
    q = trash ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
    if (body.action === "restore") q = q.gte("deleted_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
    const rows = must(await q.select("id"), "bulk lead action") as { id: string }[];
    updated += rows.length;
  }
  return ok({ updated });
});
