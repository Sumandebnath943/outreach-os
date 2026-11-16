import { NextResponse, type NextRequest } from "next/server";

/**
 * Guards the dashboard and management API:
 *  - HTTP Basic Auth (DASHBOARD_USER / DASHBOARD_PASSWORD). In production the app refuses to run
 *    open: without a password every protected route answers 503.
 *  - CSRF: browsers replay Basic credentials on cross-site requests, so state-changing requests
 *    must come from this origin.
 * Public by design: tracking endpoints (pixel, click, portfolio beacon) and the cron worker
 * (which checks its own CRON_SECRET bearer token).
 */
const PUBLIC = [/^\/api\/track\//, /^\/api\/cron\//];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function decodeBasic(header: string): [string, string] | null {
  if (!header.startsWith("Basic ")) return null;
  try {
    const bin = atob(header.slice(6).trim());
    const text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const i = text.indexOf(":");
    return i < 0 ? null : [text.slice(0, i), text.slice(i + 1)];
  } catch {
    return null;
  }
}

function isCrossSite(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = req.headers.get("origin");
  if (!origin) return false; // non-browser client (curl, scripts) — still needs the password
  try {
    return new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host);
  } catch {
    return true;
  }
}

export function middleware(req: NextRequest) {
  if (PUBLIC.some((re) => re.test(req.nextUrl.pathname))) return NextResponse.next();

  if (!SAFE_METHODS.has(req.method) && isCrossSite(req)) {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }

  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("OutreachOS is locked: set DASHBOARD_PASSWORD (and DASHBOARD_USER) in the environment.", {
        status: 503,
      });
    }
    return NextResponse.next(); // local development only
  }

  const user = process.env.DASHBOARD_USER || "admin";
  const creds = decodeBasic(req.headers.get("authorization") ?? "");
  if (creds && safeEqual(creds[0], user) && safeEqual(creds[1], password)) return NextResponse.next();

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="OutreachOS", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
