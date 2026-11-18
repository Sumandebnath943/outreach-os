import { describe, expect, it } from "vitest";
import { serverKeyProblem } from "@/lib/server/env";

const jwt = (payload: object) =>
  ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");

describe("serverKeyProblem", () => {
  it("accepts secret keys and legacy service_role keys", () => {
    expect(serverKeyProblem("sb_secret_abc123")).toBeNull();
    expect(serverKeyProblem(jwt({ role: "service_role" }))).toBeNull();
  });

  it("rejects publishable and anon keys with a fix-it message", () => {
    expect(serverKeyProblem("sb_publishable_abc123")).toMatch(/publishable key/);
    expect(serverKeyProblem(jwt({ role: "anon" }))).toMatch(/"anon" key/);
  });
});
