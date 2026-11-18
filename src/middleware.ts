import { NextResponse, type NextRequest } from "next/server";
import { safeEqual, SESSION_COOKIE, sessionKey, verifySessionToken } from "@/lib/session";

/**
 * Guards the dashboard and management API.
 *  - Sign-in: a signed session cookie set by the home page's sign-in form (/api/auth/login).
 *    HTTP Basic credentials (DASHBOARD_USER / DASHBOARD_PASSWORD) are still accepted, for scripts.
 *  - Signed-out page visits go to the home page (with ?next= to come back); signed-out API calls
 *    get a plain 401 (no browser password popup).
 *  - In production the dashboard refuses to run open: without DASHBOARD_PASSWORD every protected
 *    route answers 503.
 *  - CSRF: state-changing requests must come from this origin.
 * Public by design: the home page, sign-in/out, legal pages, tracking endpoints and the cron
 * worker (which checks its own CRON_SECRET).
 */
const PUBLIC = [
  /^\/$/,
  /^\/api\/auth\/(login|logout)$/,
  /^\/api\/track\//,
  /^\/api\/cron\//,
  /^\/privacy-policy\/?$/,
  /^\/terms\/?$/,
];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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
  if (!origin) return false; // non-browser client (curl, scripts) — still needs credentials
  try {
    return new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host);
  } catch {
    return true;
  }
}

/** True when the request carries a valid session cookie or valid Basic credentials. */
export async function isSignedIn(req: NextRequest): Promise<boolean> {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return false;
  const user = process.env.DASHBOARD_USER || "admin";
  const key = sessionKey({ password, sessionSecret: process.env.SESSION_SECRET, cronSecret: process.env.CRON_SECRET })!;
  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, user, key)) return true;
  const creds = decodeBasic(req.headers.get("authorization") ?? "");
  return Boolean(creds && safeEqual(creds[0], user) && safeEqual(creds[1], password));
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (!SAFE_METHODS.has(req.method) && !/^\/api\/(track|cron)\//.test(path) && isCrossSite(req)) {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }

  const password = process.env.DASHBOARD_PASSWORD;
  const devOpen = !password && process.env.NODE_ENV !== "production"; // local development only

  // Home page: signed-in visitors (and old Telegram "/?lead=" links) go straight to the pipeline.
  if (path === "/") {
    if (devOpen || (password && (await isSignedIn(req)))) {
      const to = req.nextUrl.clone();
      to.pathname = "/pipeline";
      return NextResponse.redirect(to);
    }
    return NextResponse.next();
  }
  if (PUBLIC.some((re) => re.test(path))) return NextResponse.next();

  if (!password) {
    if (devOpen) return NextResponse.next();
    return new NextResponse("OutreachOS is locked: set DASHBOARD_PASSWORD (and DASHBOARD_USER) in the environment.", { status: 503 });
  }
  if (await isSignedIn(req)) return NextResponse.next();

  if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const home = req.nextUrl.clone();
  home.pathname = "/";
  home.search = "";
  home.searchParams.set("next", `${path}${req.nextUrl.search}`);
  return NextResponse.redirect(home);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
