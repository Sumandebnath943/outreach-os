import "server-only";
import { env } from "./env";

export function isTelegramConfigured(): boolean {
  return Boolean(env.telegramBotToken() && env.telegramChatId());
}

/**
 * Sends one HTML message to the configured chat. Never throws: alerts must not break the worker
 * or block a send. Returns whether Telegram accepted it.
 */
export async function sendTelegram(html: string): Promise<boolean> {
  if (!isTelegramConfigured()) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.telegramChatId(), text: html.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("[telegram] send failed", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error("[telegram] send failed", (e as Error).message);
    return false;
  }
}
