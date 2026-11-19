import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { InputError, readJson, route } from "@/lib/server/http";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as portfolio } from "@/app/api/track/portfolio/route";
import { POST as bulk } from "@/app/api/leads/bulk/route";
import { POST as approvals } from "@/app/api/approvals/route";
import { PUT as templates } from "@/app/api/templates/route";

const request = (body: string) => new Request("https://crm.example.com/api/test", { method: "POST", body });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("untrusted JSON payloads", () => {
  it.each(["null", "[]", "true", "42", '"text"', "{broken", ""])("rejects %s before reaching route logic", async body => {
    await expect(readJson(request(body))).rejects.toBeInstanceOf(InputError);
  });

  it("preserves valid object bodies", async () => {
    expect(await readJson(request('{"rows":[],"dryRun":true}'))).toEqual({ rows: [], dryRun: true });
  });

  it("returns a client error through the real route wrapper", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await route(async (req: Request) => { await readJson(req); return new Response(); })(request("null"));
    expect(response.status).toBe(400);
  });

  it("handles malformed login payloads without issuing a session", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const body of ["null", "[]", "{broken"]) {
      const response = await login(request(body));
      expect(response.status).toBe(400);
      expect(response.headers.has("set-cookie")).toBe(false);
    }
  });

  it("rejects null portfolio beacons from an allowed origin", async () => {
    vi.stubEnv("PORTFOLIO_ALLOWED_ORIGINS", "https://portfolio.example.com");
    for (const body of ["null", "[]", "42"]) {
      const response = await portfolio(new NextRequest("https://crm.example.com/api/track/portfolio", {
        method: "POST", headers: { origin: "https://portfolio.example.com" }, body,
      }));
      expect(response.status).toBe(400);
    }
  });

  it("rejects malformed nested arrays before accessing the database", async () => {
    expect((await bulk(request('{"action":"pause","ids":{}}'))).status).toBe(400);
    expect((await approvals(request('{"action":"approve","leadIds":{}}'))).status).toBe(400);
    expect((await templates(request('{"templates":[null]}'))).status).toBe(400);
  });
});
