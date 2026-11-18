import "server-only";
import { env } from "./env";
import { buildReplyPrompt, keywordInsight, parseReplyInsight, type ReplyInsight } from "../ai";

export function isAiConfigured(): boolean {
  return Boolean(env.groqApiKey());
}

/**
 * Asks Groq (OpenAI-compatible chat completions, JSON mode) to triage a reply. Returns the keyword
 * insight when AI is not configured or anything goes wrong, so reply handling never depends on it.
 */
export async function analyzeReply(input: Parameters<typeof buildReplyPrompt>[0]): Promise<ReplyInsight> {
  const fallback = keywordInsight(input.text);
  if (!isAiConfigured()) return fallback;
  const { system, user } = buildReplyPrompt(input);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.groqApiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.groqModel(),
        temperature: 0,
        max_completion_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error("[groq] request failed", res.status, (await res.text()).slice(0, 300));
      return fallback;
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseReplyInsight(json.choices?.[0]?.message?.content, fallback, input.receivedAt);
  } catch (e) {
    console.error("[groq] request failed", (e as Error).message);
    return fallback;
  }
}
