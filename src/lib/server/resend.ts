import "server-only";
import { Resend } from "resend";
import { env } from "./env";
import { formatAddress } from "./mime";
import type { SystemSettings } from "../types";

export function isResendConfigured(): boolean {
  return Boolean(env.resendApiKey());
}

export async function sendViaResend(
  settings: Pick<SystemSettings, "sender_name" | "sender_email">,
  msg: {
    to: string;
    toName?: string;
    subject: string;
    html: string;
    text: string;
    messageId: string;
    inReplyTo?: string | null;
    references?: string | null;
  },
): Promise<{ id: string }> {
  const resend = new Resend(env.resendApiKey());
  const headers: Record<string, string> = { "Message-ID": msg.messageId };
  if (msg.inReplyTo) headers["In-Reply-To"] = msg.inReplyTo;
  if (msg.references) headers["References"] = msg.references;

  const { data, error } = await resend.emails.send({
    from: env.resendFrom() || formatAddress(settings.sender_email, settings.sender_name),
    to: [msg.toName ? formatAddress(msg.to, msg.toName) : msg.to],
    replyTo: env.resendReplyTo() || settings.sender_email,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    headers,
  });
  if (error || !data) throw new Error(`Resend: ${error?.message ?? "unknown error"}`);
  return { id: data.id };
}
