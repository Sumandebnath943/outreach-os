import { env } from "@/lib/server/env";
import { fail, ok, route } from "@/lib/server/http";
import { isTelegramConfigured, sendTelegram } from "@/lib/server/telegram";
import { escapeHtml } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** POST /api/notify/test — sends a test message to the configured Telegram chat (dashboard button). */
export const POST = route(async () => {
  if (!isTelegramConfigured()) return fail("Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID first", 400);
  const sent = await sendTelegram(
    [
      "✅ <b>OutreachOS alerts are connected</b>",
      "",
      "You'll get a message here on every reply (🔥 for positive ones), with links to the Gmail thread and the lead's dossier,",
      `plus a digest each weekday morning at ${escapeHtml(env.digestTime())} (${escapeHtml(env.ownerTimezone())}).`,
    ].join("\n"),
  );
  if (!sent) return fail("Telegram rejected the message — check the bot token, and that you've sent /start to the bot from this chat", 502);
  return ok({ sent: true });
});
