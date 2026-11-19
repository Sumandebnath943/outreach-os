import { after, type NextRequest } from "next/server";
import { attachDuration, recordEngagement } from "@/lib/server/engagement";
import { env } from "@/lib/server/env";
import { UUID_RE } from "@/lib/utils";

export const dynamic = "force-dynamic";

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = env.portfolioOrigins();
  const ok = origin && (allowed.includes("*") || allowed.includes(origin.replace(/\/$/, "")));
  return {
    ...(ok ? { "Access-Control-Allow-Origin": origin! } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function originAllowed(origin: string | null): boolean {
  const allowed = env.portfolioOrigins();
  if (allowed.includes("*")) return true;
  return Boolean(origin && allowed.includes(origin.replace(/\/$/, "")));
}

export function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

/**
 * POST /api/track/portfolio — beacon from sumandebnath.houseofnamus.com
 * Body (JSON, sent as text/plain via sendBeacon or application/json via fetch):
 *   { ref: lead_uuid, path: "/agents/migi", type?: "view" | "leave", durationSec?: number, title?: string }
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);
  if (!originAllowed(origin)) return new Response("origin not allowed", { status: 403, headers });

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new Response("bad payload", { status: 400, headers });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return new Response("bad payload", { status: 400, headers });

  const ref = String(body.ref ?? "");
  if (!UUID_RE.test(ref)) return new Response(null, { status: 204, headers });
  let path = String(body.path ?? "/").slice(0, 300);
  if (!path.startsWith("/")) path = `/${path}`;
  const type = body.type === "leave" ? "leave" : "view";
  const duration = Math.max(0, Math.min(7200, Math.round(Number(body.durationSec ?? 0)) || 0));
  const ua = req.headers.get("user-agent") ?? "";

  after(async () => {
    try {
      if (type === "leave") {
        await attachDuration(ref, path, duration);
      } else {
        await recordEngagement(ref, "view", {
          page: path,
          metadata: {
            path,
            title: typeof body.title === "string" ? body.title.slice(0, 200) : undefined,
            durationSec: duration || undefined,
            referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 300) : undefined,
            ua: ua.slice(0, 300),
          },
        });
      }
    } catch (e) {
      console.error("[track/portfolio]", e);
    }
  });

  return new Response(null, { status: 204, headers });
}
