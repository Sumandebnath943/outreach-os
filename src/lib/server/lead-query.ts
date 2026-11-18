import "server-only";
import { db, must } from "./db";
import { FUNNEL_STAGES, GEO_REGIONS, ROLE_TRACKS } from "../types";
import { UUID_RE } from "../utils";
import { SENDABLE_STAGES } from "../funnel";
import { InputError } from "./http";

export interface LeadFilters { q?: string; stage?: string; geo?: string; track?: string; batch?: string; status?: string; trash?: string }
export function filtersFrom(sp: URLSearchParams): LeadFilters {
  const f = Object.fromEntries(["q", "stage", "geo", "track", "batch", "status", "trash"].map(k => [k, sp.get(k) || ""]));
  if (f.stage && !(FUNNEL_STAGES as readonly string[]).includes(f.stage)) throw new InputError("Invalid stage");
  if (f.geo && !(GEO_REGIONS as readonly string[]).includes(f.geo)) throw new InputError("Invalid region");
  if (f.track && !(ROLE_TRACKS as readonly string[]).includes(f.track)) throw new InputError("Invalid track");
  if (f.batch && !UUID_RE.test(f.batch)) throw new InputError("Invalid import batch");
  if (f.status && !["PENDING", "APPROVED", "PAUSED"].includes(f.status)) throw new InputError("Invalid status");
  return f;
}
export function leadQuery(f: LeadFilters, columns = "*") {
  let q = db().from("leads").select(columns, { count: "exact" });
  q = f.trash === "true" ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
  if (f.stage) q = q.eq("funnel_stage", f.stage);
  if (f.geo) q = q.eq("geo_region", f.geo);
  if (f.track) q = q.eq("role_track", f.track);
  if (f.batch) q = q.eq("import_batch_id", f.batch);
  if (f.status) q = q.eq("approval_status", f.status);
  const needle = f.q?.slice(0, 100).replace(/[%,().:*\\"']/g, " ").trim();
  if (needle) q = q.or(`email.ilike.%${needle}%,company_name.ilike.%${needle}%,first_name.ilike.%${needle}%,last_name.ilike.%${needle}%`);
  return q;
}
export function approvalQuery(f: LeadFilters, columns = "*") {
  return leadQuery({ ...f, trash: "false" }, columns).eq("sequence_active", true).lt("current_touch", 4)
    .in("funnel_stage", SENDABLE_STAGES).lte("next_touch_due_at", new Date(Date.now() + 86_400_000).toISOString());
}
export function pagination(sp: URLSearchParams) {
  const size = [25, 50, 100].includes(Number(sp.get("pageSize"))) ? Number(sp.get("pageSize")) : 25;
  const page = Math.max(1, Math.floor(Number(sp.get("page")) || 1));
  return { page, pageSize: size, from: (page - 1) * size, to: page * size - 1 };
}
export async function collectIds(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await query(from, from + 999), "collect matching leads") as { id: string }[];
    ids.push(...rows.map(r => r.id));
    if (rows.length < 1000) return ids;
  }
}
export async function suppression(email: string): Promise<string | null> {
  const res = await db().from("suppressed_addresses").select("reason").eq("email", email.toLowerCase()).maybeSingle();
  const row = must(res, "check suppressed address") as { reason: string } | null;
  return row?.reason ?? null;
}
