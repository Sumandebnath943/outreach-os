import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(new URL(path, "https://crm.example.com"), { method: init.method ?? "GET", headers: { host: "crm.example.com", ...init.headers } });

const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;
const passed = (res: Response) => res.headers.get("x-middleware-next") === "1";

afterEach(() => vi.unstubAllEnvs());

describe("dashboard auth", () => {
  it("keeps tracking and cron endpoints public", () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "pw");
    expect(passed(middleware(req("/api/track/open?l=x")))).toBe(true);
    expect(passed(middleware(req("/api/cron/process-queue", { method: "POST" })))).toBe(true);
  });

  it("requires Basic credentials when a password is set", () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "pä55");
    vi.stubEnv("DASHBOARD_USER", "suman");
    expect(middleware(req("/")).status).toBe(401);
    expect(middleware(req("/", { headers: { authorization: basic("suman", "wrong") } })).status).toBe(401);
    expect(passed(middleware(req("/", { headers: { authorization: basic("suman", "pä55") } })))).toBe(true);
  });

  it("refuses to run open in production", () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(middleware(req("/api/leads")).status).toBe(503);
  });
});

describe("CSRF guard", () => {
  it("blocks cross-site state changes even with valid credentials", () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "pw");
    const auth = basic("admin", "pw");
    const crossSite = middleware(req("/api/queue/run", { method: "POST", headers: { authorization: auth, "sec-fetch-site": "cross-site" } }));
    expect(crossSite.status).toBe(403);
    const foreignOrigin = middleware(req("/api/leads/import", { method: "POST", headers: { authorization: auth, origin: "https://evil.example" } }));
    expect(foreignOrigin.status).toBe(403);
  });

  it("allows same-origin writes and cross-site reads", () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "pw");
    const auth = basic("admin", "pw");
    expect(passed(middleware(req("/api/leads", { method: "PATCH", headers: { authorization: auth, "sec-fetch-site": "same-origin" } })))).toBe(true);
    expect(passed(middleware(req("/api/leads", { method: "POST", headers: { authorization: auth, origin: "https://crm.example.com" } })))).toBe(true);
    expect(passed(middleware(req("/", { headers: { authorization: auth, "sec-fetch-site": "cross-site" } })))).toBe(true);
  });
});
