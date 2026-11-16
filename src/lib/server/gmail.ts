import "server-only";
import { auth as gauth, gmail as gmailApi, type gmail_v1 } from "@googleapis/gmail";
import { env } from "./env";
import { decodeEntities, isAuthErrorMessage } from "../signals";
import type { Lead, SystemSettings } from "../types";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export function oauthClient(redirectUri?: string) {
  return new gauth.OAuth2(env.googleClientId(), env.googleClientSecret(), redirectUri);
}

export function refreshTokenFor(settings: Pick<SystemSettings, "gmail_refresh_token">): string {
  return settings.gmail_refresh_token || env.gmailRefreshToken();
}

export function isGmailConfigured(settings: Pick<SystemSettings, "gmail_refresh_token">): boolean {
  return Boolean(env.googleClientId() && env.googleClientSecret() && refreshTokenFor(settings));
}

export function gmailClient(settings: Pick<SystemSettings, "gmail_refresh_token">): gmail_v1.Gmail | null {
  if (!isGmailConfigured(settings)) return null;
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: refreshTokenFor(settings) });
  return gmailApi({ version: "v1", auth });
}

function header(msg: gmail_v1.Schema$Message, name: string): string | undefined {
  return msg.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

function addressOf(from: string | undefined): string {
  if (!from) return "";
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

export async function sendViaGmail(
  gmail: gmail_v1.Gmail,
  raw: string,
  threadId?: string | null,
): Promise<{ id: string; threadId: string; messageIdHeader: string | null }> {
  const sent = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, ...(threadId ? { threadId } : {}) },
  });
  const id = sent.data.id!;
  // Gmail may rewrite Message-ID; read back the authoritative header for In-Reply-To chaining.
  let messageIdHeader: string | null = null;
  try {
    const meta = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["Message-ID", "Message-Id"],
    });
    messageIdHeader = header(meta.data, "Message-ID") ?? null;
  } catch (e) {
    console.warn("[gmail] could not read back Message-ID", e);
  }
  return { id, threadId: sent.data.threadId!, messageIdHeader };
}

export type ReplyCheck =
  | { kind: "NONE" }
  | { kind: "REPLY"; snippet: string; at: string; from: string; gmailMessageId: string }
  | { kind: "BOUNCE"; snippet: string; at: string };

const BOUNCE_RE = /mailer-daemon|postmaster|mail delivery (sub)?system/i;

function toIso(internalDate?: string | null): string {
  return internalDate ? new Date(Number(internalDate)).toISOString() : new Date().toISOString();
}

/** True when the message arrived strictly after `since` (unknown dates count as new). */
function isAfter(internalDate: string | null | undefined, since: Date): boolean {
  return !internalDate || Number(internalDate) > since.getTime();
}

/** Gmail/OAuth errors that mean the stored credentials are unusable (revoked, expired, wrong client). */
export function isGmailAuthError(e: unknown): boolean {
  const code = (e as { code?: number | string })?.code;
  if (code === 401 || code === "401") return true;
  const data = (e as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return isAuthErrorMessage(`${(e as Error)?.message ?? e} ${typeof data === "string" ? data : ""}`);
}

/**
 * Detects inbound activity for a lead that arrived after `since`:
 *  1. scans the lead's Gmail thread for any non-SENT message (reply or bounce), then
 *  2. searches the mailbox for mail from the lead (replies that started a new thread,
 *     or replies to Resend-sent mail), then
 *  3. searches for delivery-failure notices that mention the lead's address.
 */
export async function checkInbound(
  gmail: gmail_v1.Gmail,
  lead: Pick<Lead, "email" | "gmail_thread_id">,
  senderEmail: string,
  since: Date,
): Promise<ReplyCheck> {
  const me = senderEmail.toLowerCase();

  if (lead.gmail_thread_id) {
    try {
      const t = await gmail.users.threads.get({
        userId: "me",
        id: lead.gmail_thread_id,
        format: "metadata",
        metadataHeaders: ["From", "Subject"],
      });
      for (const msg of t.data.messages ?? []) {
        const labels = msg.labelIds ?? [];
        if (labels.includes("SENT") || labels.includes("DRAFT")) continue;
        if (!isAfter(msg.internalDate, since)) continue;
        const from = header(msg, "From") ?? "";
        if (addressOf(from) === me) continue;
        const snippet = decodeEntities(msg.snippet ?? "");
        if (BOUNCE_RE.test(from)) return { kind: "BOUNCE", snippet, at: toIso(msg.internalDate) };
        return { kind: "REPLY", snippet, at: toIso(msg.internalDate), from, gmailMessageId: msg.id! };
      }
    } catch (e: unknown) {
      const status = (e as { code?: number }).code;
      if (status !== 404) throw e;
    }
  }

  // Gmail's `after:` has 1-second resolution; the newest hit is re-checked against `since` below.
  const after = Math.floor(since.getTime() / 1000);
  const fromSearch = await gmail.users.messages.list({
    userId: "me",
    q: `from:${lead.email} after:${after}`,
    maxResults: 1,
  });
  const hit = fromSearch.data.messages?.[0];
  if (hit?.id) {
    const msg = await gmail.users.messages.get({ userId: "me", id: hit.id, format: "metadata", metadataHeaders: ["From"] });
    if (isAfter(msg.data.internalDate, since)) {
      return {
        kind: "REPLY",
        snippet: decodeEntities(msg.data.snippet ?? ""),
        at: toIso(msg.data.internalDate),
        from: header(msg.data, "From") ?? lead.email,
        gmailMessageId: hit.id,
      };
    }
  }

  const bounceSearch = await gmail.users.messages.list({
    userId: "me",
    q: `from:(mailer-daemon OR postmaster) after:${after} "${lead.email}"`,
    maxResults: 1,
  });
  const bounce = bounceSearch.data.messages?.[0];
  if (bounce?.id) {
    const msg = await gmail.users.messages.get({ userId: "me", id: bounce.id, format: "minimal" });
    if (isAfter(msg.data.internalDate, since)) {
      return { kind: "BOUNCE", snippet: decodeEntities(msg.data.snippet ?? ""), at: toIso(msg.data.internalDate) };
    }
  }

  return { kind: "NONE" };
}
