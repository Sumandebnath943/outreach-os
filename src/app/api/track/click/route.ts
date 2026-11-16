import { after, NextResponse, type NextRequest } from "next/server";
import { recordEngagement } from "@/lib/server/engagement";
import { getSettings } from "@/lib/server/db";
import { verifyClick } from "@/lib/server/tracking";

export const dynamic = "force-dynamic";

/** Resolves a signed click link to its destination; unsigned or tampered links get the portfolio home. */
async function resolve(req: NextRequest): Promise<{ dest: URL | null; fallback: Response | null; lead: string; log: string }> {
  const sp = req.nextUrl.searchParams;
  const lead = sp.get("l") ?? "";
  const log = sp.get("e") ?? "";
  const target = sp.get("u") ?? "";
  const sig = sp.get("s") ?? "";

  let dest: URL | null = null;
  try {
    const u = new URL(target);
    if (u.protocol === "https:" || u.protocol === "http:") dest = u;
  } catch {}

  // Only signed links redirect to arbitrary targets — prevents open-redirect abuse.
  if (dest && verifyClick(lead, log, target, sig)) return { dest, fallback: null, lead, log };
  try {
    const s = await getSettings();
    return { dest: null, fallback: NextResponse.redirect(s.portfolio_base_url, 302), lead, log };
  } catch {
    return { dest: null, fallback: new Response("Invalid link", { status: 400 }), lead, log };
  }
}

function redirect(to: URL): Response {
  const res = NextResponse.redirect(to.toString(), 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer-when-downgrade");
  return res;
}

/** GET /api/track/click?l={lead}&e={log}&u={target}&s={hmac} — logs the click, then 302s. */
export async function GET(req: NextRequest) {
  const { dest, fallback, lead, log } = await resolve(req);
  if (!dest) return fallback!;

  const ua = req.headers.get("user-agent") ?? "";
  after(async () => {
    try {
      await recordEngagement(lead, "click", {
        logId: log,
        userAgent: ua,
        metadata: { url: dest.toString(), path: dest.pathname, ua: ua.slice(0, 300) },
      });
    } catch (e) {
      console.error("[track/click]", e);
    }
  });
  return redirect(dest);
}

/** Link scanners probe with HEAD — redirect without counting a click. */
export async function HEAD(req: NextRequest) {
  const { dest, fallback } = await resolve(req);
  return dest ? redirect(dest) : fallback!;
}
