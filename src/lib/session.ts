/**
 * Signed session cookie for the dashboard (Web Crypto, so it runs in both the Edge middleware
 * and Node route handlers). Token = "<expiry ms>.<HMAC-SHA256(user|expiry)>", keyed by the
 * dashboard password (+ SESSION_SECRET / CRON_SECRET), so changing the password signs everyone out.
 */
export const SESSION_COOKIE = "oos_session";
export const SESSION_DAYS = 30;

export function sessionKey(env: { password?: string; sessionSecret?: string; cronSecret?: string }): string | null {
  if (!env.password) return null;
  return `${env.password}::${env.sessionSecret || env.cronSecret || ""}`;
}

async function hmac(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time string comparison (length is not secret here). */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export async function createSessionToken(user: string, key: string, now = Date.now()): Promise<string> {
  const exp = now + SESSION_DAYS * 86_400_000;
  return `${exp}.${await hmac(key, `${user}|${exp}`)}`;
}

export async function verifySessionToken(token: string | undefined, user: string, key: string, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!sig || !Number.isFinite(exp) || exp < now) return false;
  return safeEqual(sig, await hmac(key, `${user}|${exp}`));
}

/** Only same-site relative paths are allowed as post-login destinations (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/pipeline"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
