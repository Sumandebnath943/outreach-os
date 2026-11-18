import { describe, expect, it } from "vitest";
import {
  buildUtm,
  displayUrl,
  findUnresolved,
  mergeVars,
  previewLinks,
  restampStage,
  stripImages,
  toHtml,
  toPlainText,
  withRef,
} from "@/lib/render";
import type { Lead } from "@/lib/types";

const L = (p: Partial<Lead> = {}) =>
  ({
    first_name: "Priya",
    last_name: "Sharma",
    company_name: "Acme AI",
    job_title: null,
    target_role_opening: null,
    custom_icebreaker: null,
    ...p,
  }) as Lead;

const ID = "11111111-1111-4111-8111-111111111111";
const links = previewLinks(ID, "https://sumandebnath.houseofnamus.com", "https://sumandebnath.houseofnamus.com/resume");

describe("mergeVars", () => {
  it("fills variables and defaults blank first names to Team", () => {
    expect(mergeVars("Hi {{first_name}} at {{company_name}}", L({ first_name: "  " }))).toBe("Hi Team at Acme AI");
    expect(mergeVars("{{target_role_opening}}", L())).toBe("Senior Brand Marketing, AI Product Marketing or AI Product Manager");
    expect(mergeVars("{{target_role_opening}}", L({ role_track: "AI_PM" }))).toBe("AI Product Manager");
    expect(mergeVars("{{target_role_opening}}", L({ role_track: "BRAND", target_role_opening: "Head of Brand" }))).toBe("Head of Brand");
  });

  it("collapses an empty icebreaker with no stray blank line", () => {
    const t = "Hi {{first_name}},\n\n{{custom_icebreaker}}This is a cold outreach.";
    expect(mergeVars(t, L())).toBe("Hi Priya,\n\nThis is a cold outreach.");
    expect(mergeVars(t, L({ custom_icebreaker: "Loved the launch." }))).toBe("Hi Priya,\n\nLoved the launch.\n\nThis is a cold outreach.");
  });

  it("keeps link tokens for the renderer and reports unknown ones", () => {
    const merged = mergeVars("See {{ tracked_portfolio_url }} {{favourite_colour}}", L());
    expect(merged).toContain("{{tracked_portfolio_url}}");
    expect(findUnresolved(merged)).toEqual(["{{favourite_colour}}"]);
  });

  it("substitutes the original subject for follow-ups", () => {
    expect(mergeVars("Re: {{original_subject}}", L(), { originalSubject: "Open roles?" })).toBe("Re: Open roles?");
  });
});

describe("toHtml / toPlainText", () => {
  it("escapes HTML from lead data", () => {
    const html = toHtml(mergeVars("Hi {{company_name}}", L({ company_name: '<img src=x onerror="alert(1)">' })), links);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("renders paragraphs, bullets and tracked anchors", () => {
    const html = toHtml("Intro\n\n- one\n- two\n\nLink: {{tracked_portfolio_url}}", links, "https://app/px");
    expect(html).toContain("<ul");
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain(`href="https://sumandebnath.houseofnamus.com/?ref=${ID}"`);
    expect(html).toContain(">sumandebnath.houseofnamus.com</a>");
    expect(html).toContain('<img src="https://app/px"');
    expect(stripImages(html)).not.toContain("<img");
  });

  it("uses direct ?ref= URLs in the text part", () => {
    expect(toPlainText("Resume: {{tracked_resume_url}}", links)).toBe(`Resume: https://sumandebnath.houseofnamus.com/resume?ref=${ID}`);
  });
});

describe("labelled links and the shared signature", () => {
  const sig = "Suman Debnath\n{{tracked_portfolio_url|Portfolio}} · {{tracked_linkedin_url|LinkedIn}}";

  it("expands {{signature}} and keeps the link labels", () => {
    const merged = mergeVars("Best,\n{{signature}}", L(), { signature: sig });
    expect(merged).toBe("Best,\nSuman Debnath\n{{tracked_portfolio_url|Portfolio}} · {{tracked_linkedin_url|LinkedIn}}");
    expect(findUnresolved(merged)).toEqual([]);
  });

  it("renders labels as clickable words in HTML and 'Label (url)' in text", () => {
    const withLi = previewLinks(ID, "https://x.com", "https://x.com/resume", "https://www.linkedin.com/in/me");
    const merged = mergeVars("See {{tracked_portfolio_url|my portfolio}}.\n\n{{signature}}", L(), { signature: sig });
    const html = toHtml(merged, withLi);
    expect(html).toContain(`<a href="https://x.com/?ref=${ID}" style="color:#1a73e8" target="_blank">my portfolio</a>`);
    expect(html).toContain('target="_blank">LinkedIn</a>');
    expect(toPlainText(merged, withLi)).toContain(`See my portfolio (https://x.com/?ref=${ID}).`);
  });

  it("degrades to plain words when a link isn't configured, and escapes labels once", () => {
    const merged = mergeVars("{{tracked_linkedin_url|LinkedIn}} · {{tracked_portfolio_url|Work & play}}", L());
    expect(toHtml(merged, links)).toContain("LinkedIn · <a ");
    expect(toHtml(merged, links)).toContain(">Work &amp; play</a>");
    expect(toPlainText(merged, links)).toMatch(/^LinkedIn · Work & play \(https/);
  });
});

describe("UTM tagging", () => {
  it("tags links with company, person and stage-touch", () => {
    const utm = buildUtm({ company_name: "Acme AI, Inc.", first_name: "Zoë", last_name: "O'Neil" }, "OUTREACH_ACTIVE", "T2A");
    expect(utm).toEqual({
      utm_source: "outreachos",
      utm_medium: "email",
      utm_campaign: "acme-ai-inc",
      utm_term: "zoe-o-neil",
      utm_content: "outreach_active-t2a",
    });
    const url = new URL(withRef("https://sumandebnath.houseofnamus.com", ID, utm));
    expect(url.searchParams.get("ref")).toBe(ID);
    expect(url.searchParams.get("utm_campaign")).toBe("acme-ai-inc");
  });

  it("uses 'team' when there is no real first name, and re-stamps the stage at click time", () => {
    expect(buildUtm({ company_name: "Orbit", first_name: "Team", last_name: null }, "OUTREACH_ACTIVE", "T1").utm_term).toBe("team");
    expect(restampStage("outreach_active-t2b", "WARM_ENGAGED")).toBe("warm_engaged-t2b");
    expect(restampStage("custom-value", "WARM_ENGAGED")).toBe("custom-value");
  });
});

describe("url helpers", () => {
  it("adds or replaces ?ref=", () => {
    expect(withRef("https://x.com/a?ref=old&b=1", ID)).toBe(`https://x.com/a?ref=${ID}&b=1`);
    expect(displayUrl("https://x.com/resume/")).toBe("x.com/resume");
  });
});
