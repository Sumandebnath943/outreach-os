/**
 * Pure heuristics for inbound signals: reply triage, bot-engagement filtering and
 * provider error classification. Kept free of I/O so they can be unit-tested.
 */

/** Gmail API snippets are HTML-entity encoded (`&#39;`, `&amp;` …). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => safeCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(n: number): string {
  try {
    return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}

export type ReplySentiment = "OUT_OF_OFFICE" | "NEGATIVE" | "NOT_NOW" | "POSITIVE" | "NEUTRAL";

/** Lightweight keyword triage of a reply snippet (not an LLM — first match wins, most specific first). */
export function classifyReply(snippet: string): ReplySentiment {
  const s = decodeEntities(snippet).toLowerCase().replace(/[’‘]/g, "'");
  if (/(out of (the )?office|\booo\b|on leave|on vacation|auto-?reply|automatic reply|away until|limited access to email)/.test(s))
    return "OUT_OF_OFFICE";
  if (/(not interested|unsubscribe|remove me|stop emailing|no thanks|not a fit|not the right fit|decline|we('ve| have) decided)/.test(s))
    return "NEGATIVE";
  if (/(no headcount|next quarter|hiring freeze|not hiring|no (open )?(roles|openings|positions)|check back|reach out later|in the future|later this year)/.test(s))
    return "NOT_NOW";
  if (/(interested|let'?s (talk|chat|connect)|schedule|calendly|available|book a|set up a (call|time)|send (me )?your|happy to|would love|sounds good|\bcall\b)/.test(s))
    return "POSITIVE";
  return "NEUTRAL";
}

/** Opens/clicks this soon after the send are almost always security scanners or prefetchers. */
export const BOT_GRACE_SECONDS = 60;

const SCANNER_UA =
  /(bot\b|bot\/|crawler|spider|scanner|safelinks|mimecast|proofpoint|barracuda|symantec|trendmicro|forcepoint|ironport|fortinet|sophos|python-requests|python-urllib|curl\/|wget|go-http-client|okhttp|java\/|headlesschrome|phantomjs)/i;

/**
 * Returns why an email open/click looks automated, or null when it looks human.
 * `logPending` = the event references an email whose send has not been recorded yet.
 */
export function detectBot(input: {
  userAgent: string | null | undefined;
  sentAt: Date | null;
  logPending: boolean;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();
  if (input.logPending) return "before_send_recorded";
  const ua = (input.userAgent ?? "").trim();
  if (!ua) return "missing_user_agent";
  if (SCANNER_UA.test(ua)) return "scanner_user_agent";
  if (input.sentAt && now.getTime() - input.sentAt.getTime() < BOT_GRACE_SECONDS * 1000) return "within_grace_period";
  return null;
}

/** Provider rejected the recipient address itself — retrying cannot help. */
export function isHardBounceMessage(msg: string): boolean {
  return /invalid to header|invalid recipient|invalid `?to`?|recipient address rejected|address not found|no such user|mailbox unavailable|user unknown/i.test(
    msg,
  );
}

/** Credentials are missing, revoked or lack permission — every send will fail until fixed. */
export function isAuthErrorMessage(msg: string): boolean {
  return /invalid_grant|invalid_client|unauthorized_client|invalid credentials|insufficient (authentication|permission)|login required|api key is invalid|missing api key|restricted_api_key/i.test(
    msg,
  );
}
