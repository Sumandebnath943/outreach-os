import type { NextRequest } from "next/server";
import { db, must } from "@/lib/server/db";
import { ok, route, fail } from "@/lib/server/http";
import { UUID_RE } from "@/lib/utils";
import Papa from "papaparse";
export const GET = route(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    if (!UUID_RE.test(id)) return fail("Invalid batch");
    const batch = must(await db().from("import_batches").select("*").eq("id", id).single(), "load import report") as unknown as { exceptions: Record<string, unknown>[] } | null;
    if (!batch) return fail("Import not found", 404);
    return new Response(Papa.unparse(batch.exceptions, { escapeFormulae: true }), { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="import-exceptions.csv"' } });
  }
  const page = Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get("page")) || 1));
  const res = await db().from("import_batches").select("id, name, summary, status, created_at", { count: "exact" }).order("created_at", { ascending: false }).order("id").range((page - 1) * 25, page * 25 - 1);
  return ok({ batches: must(res, "list imports"), total: res.count ?? 0 });
});
