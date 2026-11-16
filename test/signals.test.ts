import { describe, expect, it } from "vitest";
import { classifyReply, decodeEntities, detectBot, isAuthErrorMessage, isHardBounceMessage } from "@/lib/signals";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

describe("decodeEntities", () => {
  it("decodes the entities Gmail puts in snippets", () => {
    expect(decodeEntities("Let&#39;s talk &amp; plan &quot;Q1&quot; &lt;3 &#x2014;")).toBe('Let\'s talk & plan "Q1" <3 —');
  });
});

describe("classifyReply", () => {
  it("labels common reply shapes", () => {
    expect(classifyReply("I am out of the office until Monday")).toBe("OUT_OF_OFFICE");
    expect(classifyReply("Thanks, but we're not interested")).toBe("NEGATIVE");
    expect(classifyReply("No headcount right now, check back next quarter")).toBe("NOT_NOW");
    expect(classifyReply("Let&#39;s talk — are you free Thursday?")).toBe("POSITIVE");
    expect(classifyReply("Received.")).toBe("NEUTRAL");
  });
});

describe("detectBot", () => {
  const sentAt = new Date("2026-11-16T10:00:00Z");

  it("ignores hits that fire before the send was recorded", () => {
    expect(detectBot({ userAgent: CHROME, sentAt: null, logPending: true })).toBe("before_send_recorded");
  });

  it("ignores scanner user agents and missing user agents", () => {
    expect(detectBot({ userAgent: "Mozilla/5.0 (compatible; Barracuda Sentinel)", sentAt, logPending: false })).toBe("scanner_user_agent");
    expect(detectBot({ userAgent: "", sentAt, logPending: false })).toBe("missing_user_agent");
  });

  it("ignores hits within the grace period after delivery", () => {
    expect(detectBot({ userAgent: CHROME, sentAt, logPending: false, now: new Date("2026-11-16T10:00:20Z") })).toBe("within_grace_period");
    expect(detectBot({ userAgent: CHROME, sentAt, logPending: false, now: new Date("2026-11-16T10:05:00Z") })).toBeNull();
  });

  it("treats Gmail's image proxy as a genuine open", () => {
    const gmailProxy = "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)";
    expect(detectBot({ userAgent: gmailProxy, sentAt, logPending: false, now: new Date("2026-11-16T11:00:00Z") })).toBeNull();
  });
});

describe("provider error classification", () => {
  it("separates hard bounces from auth failures and transient errors", () => {
    expect(isHardBounceMessage("Invalid To header")).toBe(true);
    expect(isHardBounceMessage('column "error" of relation "email_logs" does not exist')).toBe(false);
    expect(isAuthErrorMessage("invalid_grant: Token has been expired or revoked.")).toBe(true);
    expect(isAuthErrorMessage("API key is invalid")).toBe(true);
    expect(isAuthErrorMessage("socket hang up")).toBe(false);
  });
});
