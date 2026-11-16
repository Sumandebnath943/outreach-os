import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/server/env";
import { fail, ok, route } from "@/lib/server/http";
import { processQueue } from "@/lib/server/sequencer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = env.cronSecret();
  if (!secret) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Master worker. Call every ~10 minutes (Mon–Fri) with `Authorization: Bearer $CRON_SECRET`.
 * GET is accepted too because Vercel Cron issues GET requests.
 */
const handler = route(async (req: Request) => {
  if (!env.cronSecret()) return fail("CRON_SECRET is not configured", 503);
  if (!authorized(req)) return fail("unauthorized", 401);
  return ok(await processQueue("cron"));
});

export const GET = handler;
export const POST = handler;
