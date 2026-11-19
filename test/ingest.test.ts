import { describe, expect, it } from "vitest";
import { autoMapHeaders, inferGeo, inferRoleTrack, normalizeLead, sanitizeUrl } from "@/lib/ingest";

describe("normalizeLead", () => {
  it("rejects missing or malformed emails", () => {
    expect(normalizeLead({ company_name: "Acme" })).toEqual({ ok: false, error: "Missing email" });
    expect(normalizeLead({ email: "not-an-email", company_name: "Acme" }).ok).toBe(false);
    expect(normalizeLead({ email: "a@b.com\r\nBcc: x@y.com", company_name: "Acme" }).ok).toBe(false);
  });

  it("splits a full name, lowercases email and derives company from the domain", () => {
    const r = normalizeLead({ email: "MAILTO:Jordan.Lee@Nimbus.dev", full_name: "jordan van lee" });
    expect(r).toMatchObject({ ok: true, lead: { email: "jordan.lee@nimbus.dev", first_name: "Jordan", last_name: "van lee", company_name: "Nimbus" } });
  });

  it("does not guess a company from free-mail domains", () => {
    expect(normalizeLead({ email: "someone@gmail.com" })).toEqual({ ok: false, error: "Missing company name" });
  });

  it("drops unsafe URLs and normalises bare domains", () => {
    const r = normalizeLead({ email: "a@acme.ai", company_name: "Acme", linkedin_url: "javascript:alert(1)", company_website: "acme.ai" });
    expect(r.ok && r.lead.linkedin_url).toBeNull();
    expect(r.ok && r.lead.company_website).toBe("https://acme.ai/");
  });

  it("caps field lengths", () => {
    const r = normalizeLead({ email: "a@acme.ai", company_name: "Acme", custom_icebreaker: "x".repeat(5000) });
    expect(r.ok && r.lead.custom_icebreaker?.length).toBe(600);
  });

  it("rejects an overlong address instead of silently changing its recipient", () => {
    const email = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(59)}.com`;
    expect(email.length).toBeGreaterThan(254);
    expect(normalizeLead({ email, company_name: "Acme" }).ok).toBe(false);
    expect(normalizeLead({ email: `MAILTO:${email}`, company_name: "Acme" }).ok).toBe(false);
  });

  it("applies only valid bulk overrides", () => {
    const base = { email: "a@acme.ai", company_name: "Acme", target_role_opening: "AI Product Manager" };
    expect(normalizeLead(base, { role_track: "BRAND", geo_region: "US" })).toMatchObject({ lead: { role_track: "BRAND", geo_region: "US" } });
    // @ts-expect-error — invalid values from an untrusted client are ignored
    expect(normalizeLead(base, { role_track: "HACKER", geo_region: "MARS" })).toMatchObject({ lead: { role_track: "AI_PM" } });
  });
});

describe("inference", () => {
  it("assigns role tracks from the target opening", () => {
    expect(inferRoleTrack("AI Product Marketing Manager")).toBe("AI_PMM");
    expect(inferRoleTrack("Senior Product Manager, AI")).toBe("AI_PM");
    expect(inferRoleTrack("Senior Brand Marketing Manager")).toBe("BRAND");
    expect(inferRoleTrack(null)).toBe("HYBRID_DEFAULT");
  });

  it("assigns geo from codes, cities and domains", () => {
    expect(inferGeo("IN")).toBe("INDIA");
    expect(inferGeo("Bengaluru, Karnataka")).toBe("INDIA");
    expect(inferGeo("Remote, US")).toBe("US");
    expect(inferGeo("London")).toBe("GLOBAL");
    expect(inferGeo(null, "x@acme.co.in")).toBe("INDIA");
  });

  it("auto-maps common export headers", () => {
    expect(autoMapHeaders(["Work Email", "Company Name", "Name", "Person Linkedin Url", "Random"])).toEqual({
      "Work Email": "email",
      "Company Name": "company_name",
      Name: "full_name",
      "Person Linkedin Url": "linkedin_url",
      Random: "",
    });
  });
});

describe("sanitizeUrl", () => {
  it("accepts only http(s) with a real host", () => {
    expect(sanitizeUrl("https://linkedin.com/in/x")).toBe("https://linkedin.com/in/x");
    expect(sanitizeUrl("data:text/html,hi")).toBeNull();
    expect(sanitizeUrl("localhost")).toBeNull();
    expect(sanitizeUrl("")).toBeNull();
  });
});
