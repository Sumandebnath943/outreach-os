import "server-only";
import { randomUUID } from "node:crypto";

/**
 * RFC 2822 / RFC 2045 MIME builder for Gmail `users.messages.send` (raw).
 * Produces multipart/alternative (text + html), RFC 2047 encoded headers and
 * the In-Reply-To / References chain needed for same-thread follow-ups.
 */
export interface MimeInput {
  fromName: string;
  fromEmail: string;
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html: string;
  messageId?: string;
  inReplyTo?: string | null;
  references?: string | null;
  replyTo?: string | null;
  date?: Date;
}

const sanitize = (v: string) => v.replace(/[\r\n]+/g, " ").trim();

/** RFC 2047 encoded-word when non-ASCII is present, otherwise the plain value. */
export function encodeHeader(value: string): string {
  const v = sanitize(value);
  if (/^[\x20-\x7E]*$/.test(v)) return v;
  // Split into chunks so each encoded-word stays well under 75 chars.
  const bytes = Buffer.from(v, "utf8");
  const words: string[] = [];
  let chunk: number[] = [];
  const flush = () => {
    if (chunk.length) words.push(`=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`);
    chunk = [];
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    // never split a multi-byte UTF-8 sequence: only flush on a lead byte
    if (chunk.length >= 42 && (b & 0xc0) !== 0x80) flush();
    chunk.push(b);
  }
  flush();
  return words.join("\r\n ");
}

export function formatAddress(email: string, name?: string): string {
  const addr = sanitize(email);
  if (!name) return addr;
  const n = sanitize(name);
  if (/^[\x20-\x7E]*$/.test(n)) return `"${n.replace(/["\\]/g, "\\$&")}" <${addr}>`;
  return `${encodeHeader(n)} <${addr}>`;
}

export function newMessageId(fromEmail: string): string {
  const domain = fromEmail.split("@")[1] || "outreach-os.local";
  return `<${randomUUID()}@${domain}>`;
}

function b64Lines(s: string): string {
  return (
    Buffer.from(s, "utf8")
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? ""
  );
}

export function buildMime(m: MimeInput): { raw: string; messageId: string } {
  const messageId = m.messageId ?? newMessageId(m.fromEmail);
  const boundary = `oos_${randomUUID().replace(/-/g, "")}`;
  const headers = [
    `From: ${formatAddress(m.fromEmail, m.fromName)}`,
    `To: ${formatAddress(m.to, m.toName)}`,
    `Subject: ${encodeHeader(m.subject)}`,
    `Date: ${(m.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: ${sanitize(messageId)}`,
  ];
  if (m.replyTo) headers.push(`Reply-To: ${sanitize(m.replyTo)}`);
  if (m.inReplyTo) headers.push(`In-Reply-To: ${sanitize(m.inReplyTo)}`);
  if (m.references) headers.push(`References: ${sanitize(m.references)}`);
  headers.push("MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${boundary}"`);

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(m.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(m.html),
    `--${boundary}--`,
    "",
  ];

  const message = `${headers.join("\r\n")}\r\n\r\n${body.join("\r\n")}`;
  return { raw: Buffer.from(message, "utf8").toString("base64url"), messageId };
}

/** Appends a Message-ID to a References chain (space separated, de-duplicated). */
export function appendReference(chain: string | null | undefined, messageId: string | null | undefined): string | null {
  const ids = (chain ?? "").split(/\s+/).filter(Boolean);
  if (messageId && !ids.includes(messageId)) ids.push(messageId);
  return ids.length ? ids.join(" ") : null;
}

export function replySubject(original: string): string {
  return /^re:/i.test(original.trim()) ? original.trim() : `Re: ${original.trim()}`;
}
