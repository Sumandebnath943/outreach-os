import { describe, expect, it } from "vitest";
import { dossierUrl, escapeHtml, formatDigest, formatReplyAlert, gmailUrl } from "@/lib/notify";

const alert = {
  sentiment: "POSITIVE",
  late: false,
  company: "Acme <AI> & Co",
  person: "Priya Rao",
  jobTitle: "Head of Talent",
  email: "priya@acme.ai",
  snippet: "Let's talk — Thursday?",
  afterTouch: "T2A",
  roleTrack: "AI_PMM",
  geo: "INDIA",
  gmailLink: gmailUrl("me@example.com", "18c0ffee"),
  dossierLink: dossierUrl("https://app.example.com/", "11111111-1111-4111-8111-111111111111"),
};

describe("links", () => {
  it("opens the thread in the right Gmail account and the dossier on the board", () => {
    expect(gmailUrl("me@example.com", "18c0ffee")).toBe("https://mail.google.com/mail/?authuser=me%40example.com#all/18c0ffee");
    expect(gmailUrl(null, "abc")).toBe("https://mail.google.com/mail/#all/abc");
    expect(alert.dossierLink).toBe("https://app.example.com/?lead=11111111-1111-4111-8111-111111111111");
  });
});

describe("formatReplyAlert", () => {
  it("flags positive replies as hot and escapes HTML from lead data", () => {
    const msg = formatReplyAlert(alert);
    expect(msg.split("\n")[0]).toBe("🔥 <b>HOT — positive reply</b>");
    expect(msg).toContain("<b>Acme &lt;AI&gt; &amp; Co</b> · Priya Rao (Head of Talent)");
    expect(msg).toContain("after T2A · AI_PMM · INDIA");
    expect(msg).toContain('<a href="https://mail.google.com/mail/?authuser=me%40example.com#all/18c0ffee">Open in Gmail</a>');
    expect(escapeHtml('<script>"x"</script>')).toBe('&lt;script&gt;"x"&lt;/script&gt;');
  });

  it("gives each reply type its own next step", () => {
    expect(formatReplyAlert({ ...alert, sentiment: "OUT_OF_OFFICE" })).toMatch(/^🌴[\s\S]*Use Resume/);
    expect(formatReplyAlert({ ...alert, sentiment: "NEGATIVE" })).toMatch(/^✋[\s\S]*Mark as Rejected/);
    expect(formatReplyAlert({ ...alert, sentiment: "NOT_NOW" })).toMatch(/^⏳[\s\S]*Nurture/);
    expect(formatReplyAlert({ ...alert, late: true })).toContain("Late reply (after archive)");
    expect(formatReplyAlert({ ...alert, gmailLink: null })).not.toContain("Open in Gmail");
  });
});

describe("formatDigest", () => {
  const base = {
    now: new Date("2026-11-24T04:00:00Z"),
    tz: "Asia/Kolkata",
    mode: "APPROVAL_GATE" as const,
    triage: [{ company: "Acme", person: "Priya", sentiment: "POSITIVE", link: "https://x/?lead=1" }],
    triageTotal: 3,
    dueToday: 2,
    warm: [],
    warmTotal: 0,
    interviewing: 1,
    sentYesterday: 12,
    dailyLimit: 45,
    approvalsLink: "https://x/approvals",
    analyticsLink: "https://x/analytics",
  };

  it("summarises the day for approval-gate mode", () => {
    const d = formatDigest(base);
    expect(d).toContain("📋 <b>OutreachOS · Tue 24 Nov</b>");
    expect(d).toContain("Replies waiting in triage: 3");
    expect(d).toContain('• 🔥 <a href="https://x/?lead=1">Acme</a> · Priya');
    expect(d).toContain("…and 2 more");
    expect(d).toContain('2 touches waiting for approval</b> — <a href="https://x/approvals">approve</a>');
    expect(d).toContain("Sent yesterday: 12 · daily cap 45");
  });

  it("reports scheduled sends in auto-pilot and a quiet inbox", () => {
    const d = formatDigest({ ...base, mode: "AUTO_PILOT", triage: [], triageTotal: 0, dueToday: 1 });
    expect(d).toContain("No replies waiting in triage.");
    expect(d).toContain("1 touch scheduled today (auto-pilot).");
  });
});
