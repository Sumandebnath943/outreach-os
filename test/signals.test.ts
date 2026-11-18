import { describe, expect, it } from "vitest";
import { classifyDsn, classifyReply, decodeEntities, detectBot, isAuthErrorMessage, isHardBounceMessage } from "@/lib/signals";

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

describe("classifyDsn", () => {
  it("treats final delivery failures as bounces", () => {
    expect(classifyDsn("Delivery Status Notification (Failure)", "Address not found. Your message wasn't delivered to x@y.com because the address couldn't be found")).toBe("FAILURE");
    expect(classifyDsn("Undeliverable: Open roles?", "Delivery has failed to these recipients or groups")).toBe("FAILURE");
    expect(classifyDsn("Mail delivery failed", "550 5.1.1 The email account that you tried to reach does not exist")).toBe("FAILURE");
    expect(classifyDsn("Delivery Status Notification", "Message not delivered. Your message couldn't be delivered to x@y.com")).toBe("FAILURE");
    expect(classifyDsn("Message blocked", "Your message was blocked by the recipient's server (5.7.1 spam policy)")).toBe("FAILURE");
  });

  it("ignores delay notices while the server is still retrying", () => {
    expect(classifyDsn("Delivery Status Notification (Delay)", "Delivery incomplete. There was a temporary problem delivering your message to x@y.com. Gmail will retry for 47 more hours.")).toBe("DELAY");
    expect(classifyDsn("Warning: message delayed", "421 4.7.0 Temporarily deferred, will be retried")).toBe("DELAY");
    expect(classifyDsn("Notice", "Message not delivered yet — still trying")).toBe("DELAY");
  });

  it("defaults unknown wording to a failure", () => {
    expect(classifyDsn("Returned", "Something went wrong")).toBe("FAILURE");
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
