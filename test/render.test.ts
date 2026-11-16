import { describe, expect, it } from "vitest";
import { displayUrl, findUnresolved, mergeVars, previewLinks, stripImages, toHtml, toPlainText, withRef } from "@/lib/render";
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
    expect(mergeVars("{{target_role_opening}}", L())).toBe("Senior Brand Marketing / AI Product Marketing");
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

describe("url helpers", () => {
  it("adds or replaces ?ref=", () => {
    expect(withRef("https://x.com/a?ref=old&b=1", ID)).toBe(`https://x.com/a?ref=${ID}&b=1`);
    expect(displayUrl("https://x.com/resume/")).toBe("x.com/resume");
  });
});
