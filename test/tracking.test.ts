import { beforeAll, describe, expect, it } from "vitest";

const LEAD = "11111111-1111-4111-8111-111111111111";
const LOG = "22222222-2222-4222-8222-222222222222";

let tracking: typeof import("@/lib/server/tracking");
beforeAll(async () => {
  process.env.TRACKING_SECRET = "test-secret";
  process.env.APP_BASE_URL = "https://go.example.com/";
  tracking = await import("@/lib/server/tracking");
});

describe("signed click links", () => {
  it("round-trips a signed link", () => {
    const url = new URL(tracking.clickUrl(LEAD, LOG, `https://sumandebnath.houseofnamus.com/?ref=${LEAD}`));
    expect(url.origin + url.pathname).toBe("https://go.example.com/api/track/click");
    const p = url.searchParams;
    expect(tracking.verifyClick(p.get("l")!, p.get("e")!, p.get("u")!, p.get("s")!)).toBe(true);
  });

  it("rejects a tampered destination or signature", () => {
    const url = new URL(tracking.clickUrl(LEAD, LOG, "https://sumandebnath.houseofnamus.com/"));
    const p = url.searchParams;
    expect(tracking.verifyClick(LEAD, LOG, "https://evil.example/", p.get("s")!)).toBe(false);
    expect(tracking.verifyClick(LEAD, LOG, p.get("u")!, "0".repeat(24))).toBe(false);
    expect(tracking.verifyClick(LEAD, LOG, p.get("u")!, "")).toBe(false);
  });
});
