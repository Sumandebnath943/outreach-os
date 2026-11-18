import { db, must } from "@/lib/server/db";
import { fail, ok, readJson, route } from "@/lib/server/http";
import { normalizeLead, type NormalizeOverrides } from "@/lib/ingest";
import type { ImportResponse, ImportRowResult as RowResult } from "@/lib/types";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/leads/import
 * { rows: Array<Record<leadField, value>>, overrides?: { geo_region, role_track }, dryRun?: boolean }
 * Rows are already header-mapped by the importer UI. Deduplicates within the file and against the
 * database (archived addresses stay locked), then queues Touch 1 for every new lead.
 */
export const POST = route(async (req: Request) => {
  const body = await readJson<{ rows?: Record<string, unknown>[]; overrides?: NormalizeOverrides; dryRun?: boolean; name?: string }>(req);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return fail("No rows supplied");
  if (rows.length > 5000) return fail("Import at most 5,000 rows per batch");

  const results: RowResult[] = [];
  const seen = new Set<string>();
  const overrides: NormalizeOverrides = body.overrides && typeof body.overrides === "object" ? body.overrides : {};
  rows.forEach((raw, i) => {
    const n = normalizeLead(raw && typeof raw === "object" ? raw : {}, overrides);
    if (!n.ok) return results.push({ row: i + 1, status: "INVALID", error: n.error });
    if (seen.has(n.lead.email)) return results.push({ row: i + 1, status: "DUPLICATE_IN_FILE", email: n.lead.email });
    seen.add(n.lead.email);
    results.push({ row: i + 1, status: "NEW", lead: n.lead });
  });

  const emails = [...seen];
  const existing = new Map<string, string>();
  for (let i = 0; i < emails.length; i += 300) {
    const res = await db().from("leads").select("email, funnel_stage").in("email", emails.slice(i, i + 300));
    for (const r of must(res, "dedupe lookup") as { email: string; funnel_stage: string }[]) existing.set(r.email, r.funnel_stage);
    const blocked = await db().from("suppressed_addresses").select("email, reason").in("email", emails.slice(i, i + 300));
    for (const r of must(blocked, "suppression lookup") as { email: string }[]) existing.set(r.email, "SUPPRESSED");
  }
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "NEW" && existing.has(r.lead.email)) {
      const stage = existing.get(r.lead.email)!;
      results[i] = { row: r.row, status: "DUPLICATE_EXISTING", email: r.lead.email, stage, locked: stage === "CLOSED_ARCHIVE" || stage === "SUPPRESSED" };
    }
  }

  const fresh = results.filter((r): r is Extract<RowResult, { status: "NEW" }> => r.status === "NEW");
  let inserted = 0;
  const batchId = !body.dryRun ? randomUUID() : undefined;
  const exceptions = results.filter(r => r.status !== "NEW").map(r => ({ ...rows[r.row - 1], row: r.row, status: r.status, reason: r.status === "INVALID" ? r.error : r.status === "DUPLICATE_IN_FILE" ? "Duplicate in file" : r.status === "DUPLICATE_EXISTING" ? r.stage : "" }));
  if (batchId) must(await db().from("import_batches").insert({ id: batchId, name: String(body.name || "CSV import").slice(0, 160), status: "IMPORTING", summary: { total: rows.length }, exceptions }).select("id"), "create import batch");
  try {
  if (!body.dryRun && fresh.length) {
    const due = new Date().toISOString(); // Touch 1 is due immediately; the worker enforces the send window
    for (let i = 0; i < fresh.length; i += 500) {
      const chunk = fresh.slice(i, i + 500).map((r) => ({ ...r.lead, import_batch_id: batchId, next_touch_due_at: due }));
      const res = await db().from("leads").upsert(chunk, { onConflict: "email", ignoreDuplicates: true }).select("id");
      const ids = must(res, "insert leads") as { id: string }[];
      inserted += ids.length;
      if (ids.length) {
        await db()
          .from("tracking_events")
          .insert(ids.map((x) => ({ lead_id: x.id, event_type: "STAGE_CHANGE", metadata: { from: null, to: "LEAD_QUEUED", reason: "csv_import" } })));
      }
    }
  }
  } catch (e) {
    if (batchId) await db().from("import_batches").update({ status: "FAILED", summary: { total: rows.length, inserted, error: "Import interrupted. Re-upload the file; existing addresses will be skipped." } }).eq("id", batchId);
    throw e;
  }

  const count = (s: RowResult["status"]) => results.filter((r) => r.status === s).length;
  const summary = { total: rows.length, new: fresh.length, inserted, invalid: count("INVALID"), duplicateInFile: count("DUPLICATE_IN_FILE"), duplicateExisting: count("DUPLICATE_EXISTING") };
  if (batchId) must(await db().from("import_batches").update({ status: "COMPLETE", summary }).eq("id", batchId).select("id"), "complete import batch");
  return ok<ImportResponse>({
    batchId,
    dryRun: Boolean(body.dryRun),
    summary,
    results,
  });
});
