import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { createSessionToken, safeNext, SESSION_COOKIE, sessionKey, verifySessionToken } from "@/lib/session";

const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(new URL(path, "https://crm.example.com"), { method: init.method ?? "GET", headers: { host: "crm.example.com", ...init.headers } });

const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;
const passed = (res: Response) => res.headers.get("x-middleware-next") === "1";
const location = (res: Response) => res.headers.get("location");

async function sessionCookie(user = "admin", password = "pw") {
  const key = sessionKey({ password, cronSecret: process.env.CRON_SECRET })!;
  return `${SESSION_COOKIE}=${await createSessionToken(user, key)}`;
}

afterEach(() => vi.unstubAllEnvs());

describe("public routes", () => {
  it("keeps the home page, sign-in, legal pages, tracking and cron public", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "pw");
    for (const p of ["/", "/privacy-policy", "/terms/", "/api/track/open?l=x", "/api/auth/login", "/api/auth/logout"]) {
      expect(passed(await middleware(req(p, { method: p.startsWith("/api/auth") ? "POST" : "GET" }))), p).toBe(true);
    }
    expect(passed(await middleware(req("/api/cron/process-queue", { method: "POST" })))).toBe(true);
    expect((await middleware(req("/terms-and-more"))).status).toBe(307); // only the exact pages
  });
});

describe("signed-out visitors", () => {
  it("are sent to the home page (with a way back) instead of a browser password popup", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "pw");
    const page = await middleware(req("/analytics?range=7"));
    expect(page.status).toBe(307);
    expect(location(page)).toBe("https://crm.example.com/?next=%2Fanalytics%3Frange%3D7");
    const api = await middleware(req("/api/leads"));
    expect(api.status).toBe(401);
    expect(api.headers.get("www-authenticate")).toBeNull();
  });

  it("refuses to run open in production", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "");
    vi.stubEnv("NODE_ENV", "production");
    expect((await middleware(req("/api/leads"))).status).toBe(503);
    expect(passed(await middleware(req("/")))).toBe(true); // home page still renders
  });
});

describe("signed-in visitors", () => {
  it("get in with a valid session cookie, and the home page forwards them to the pipeline", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "pw");
    const cookie = await sessionCookie();
    expect(passed(await middleware(req("/settings", { headers: { cookie } })))).toBe(true);
    const home = await middleware(req("/?lead=abc", { headers: { cookie } }));
    expect(location(home)).toBe("https://crm.example.com/pipeline?lead=abc"); // old Telegram links keep working
  });

  it("reject forged, expired or stale-password cookies", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "pw");
    expect((await middleware(req("/api/leads", { headers: { cookie: `${SESSION_COOKIE}=9999999999999.forged` } }))).status).toBe(401);
    const old = await sessionCookie("admin", "old-password"); // password changed since
    expect((await middleware(req("/api/leads", { headers: { cookie: old } }))).status).toBe(401);
    const key = sessionKey({ password: "pw" })!;
    expect(await verifySessionToken(await createSessionToken("admin", key, 0), "admin", key)).toBe(false); // expired
  });

  it("still accept Basic credentials for scripts", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "pä55");
    vi.stubEnv("DASHBOARD_USER", "suman");
    expect(passed(await middleware(req("/api/stats", { headers: { authorization: basic("suman", "pä55") } })))).toBe(true);
    expect((await middleware(req("/api/stats", { headers: { authorization: basic("suman", "nope") } }))).status).toBe(401);
  });

  it("ignores Basic credentials replayed by a browser, so Sign out sticks", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "pw");
    const browser = { authorization: basic("admin", "pw"), "sec-fetch-site": "none" };
    const home = await middleware(req("/", { headers: browser }));
    expect(passed(home)).toBe(true); // stays on the home page instead of bouncing to /pipeline
    expect(location(await middleware(req("/pipeline", { headers: browser })))).toContain("/?next=");
    expect((await middleware(req("/api/stats", { headers: { ...browser, "sec-fetch-site": "same-origin" } }))).status).toBe(401);
  });
});

describe("CSRF guard", () => {
  it("blocks cross-site state changes even with a valid session", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "pw");
    const cookie = await sessionCookie();
    expect((await middleware(req("/api/queue/run", { method: "POST", headers: { cookie, "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    expect((await middleware(req("/api/auth/login", { method: "POST", headers: { origin: "https://evil.example" } }))).status).toBe(403);
    expect(passed(await middleware(req("/api/leads", { method: "PATCH", headers: { cookie, "sec-fetch-site": "same-origin" } })))).toBe(true);
  });
});

describe("safeNext", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/analytics?range=7")).toBe("/analytics?range=7");
    expect(safeNext("//evil.example")).toBe("/pipeline");
    expect(safeNext("https://evil.example")).toBe("/pipeline");
    expect(safeNext(null)).toBe("/pipeline");
  });
});
