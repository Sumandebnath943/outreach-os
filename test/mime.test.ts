import { describe, expect, it } from "vitest";
import { appendReference, buildMime, encodeHeader, formatAddress, replySubject } from "@/lib/server/mime";

const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");
const headersOf = (msg: string) => msg.split("\r\n\r\n")[0];

describe("buildMime", () => {
  const base = {
    fromName: "Suman Debnath",
    fromEmail: "suman@example.com",
    to: "priya@acme.ai",
    toName: "Priya",
    subject: "Open roles at Acme?",
    text: "Hello",
    html: "<p>Hello</p>",
  };

  it("builds multipart/alternative with threading headers", () => {
    const { raw, messageId } = buildMime({ ...base, inReplyTo: "<a@x>", references: "<a@x>" });
    const msg = decode(raw);
    const h = headersOf(msg);
    expect(h).toContain('From: "Suman Debnath" <suman@example.com>');
    expect(h).toContain("In-Reply-To: <a@x>");
    expect(h).toContain("References: <a@x>");
    expect(h).toContain(`Message-ID: ${messageId}`);
    expect(msg).toContain("Content-Type: multipart/alternative");
    expect(msg).toContain(Buffer.from("<p>Hello</p>").toString("base64"));
  });

  it("cannot be header-injected through the subject or names", () => {
    const { raw } = buildMime({ ...base, subject: "Hi\r\nBcc: victim@evil.com", toName: 'P"\r\nX: y' });
    const h = headersOf(decode(raw));
    expect(h.split("\r\n").some((l) => l.startsWith("Bcc:"))).toBe(false);
    expect(h.split("\r\n").some((l) => l.startsWith("X:"))).toBe(false);
  });
});

describe("header helpers", () => {
  it("RFC 2047-encodes non-ASCII without splitting characters", () => {
    const enc = encodeHeader("9+ yrs Brand Marketing + 21 AI products shipped solo — Open roles at Acme?");
    const words = enc.split("\r\n ");
    const decoded = words.map((w) => Buffer.from(w.slice(10, -2), "base64").toString("utf8")).join("");
    expect(decoded).toContain("— Open roles");
    expect(words.every((w) => w.length <= 75)).toBe(true);
    expect(formatAddress("a@b.co", "Zoë")).toMatch(/^=\?UTF-8\?B\?.+\?= <a@b\.co>$/);
  });

  it("chains references and reply subjects idempotently", () => {
    expect(appendReference("<a@x> <b@x>", "<b@x>")).toBe("<a@x> <b@x>");
    expect(appendReference(null, "<c@x>")).toBe("<c@x>");
    expect(replySubject("Re: Hello")).toBe("Re: Hello");
    expect(replySubject("Hello")).toBe("Re: Hello");
  });
});
