import "server-only";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

/**
 * Why a Supabase key cannot be the server key, or null when it looks right. Accepts the new
 * secret keys (`sb_secret_…`) and legacy service_role JWTs; rejects publishable/anon keys,
 * which would fail with "permission denied" on every table.
 */
export function serverKeyProblem(key: string): string | null {
  if (key.startsWith("sb_publishable_"))
    return "SUPABASE_SERVICE_ROLE_KEY holds the publishable key — use the secret key (sb_secret_…) from Supabase → Project Settings → API Keys";
  if (key.startsWith("sb_secret_")) return null;
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const role = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))?.role;
      if (role && role !== "service_role")
        return `SUPABASE_SERVICE_ROLE_KEY is a "${role}" key — use the secret key (sb_secret_…) or the legacy service_role key`;
    } catch {
      /* not a JWT — let Supabase report it */
    }
  }
  return null;
}

export const env = {
  supabaseUrl: () => req("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceKey: () => {
    const key = req("SUPABASE_SERVICE_ROLE_KEY").trim();
    const problem = serverKeyProblem(key);
    if (problem) throw new Error(problem);
    return key;
  },
  appBaseUrl: () => (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, ""),
  googleClientId: () => process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: () => process.env.GOOGLE_CLIENT_SECRET || "",
  gmailRefreshToken: () => process.env.GMAIL_REFRESH_TOKEN || "",
  resendApiKey: () => process.env.RESEND_API_KEY || "",
  resendFrom: () => process.env.RESEND_FROM || "",
  resendReplyTo: () => process.env.RESEND_REPLY_TO || "",
  cronSecret: () => process.env.CRON_SECRET || "",
  trackingSecret: () =>
    process.env.TRACKING_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "outreach-os",
  ownerTimezone: () => process.env.OWNER_TIMEZONE || "Asia/Kolkata",
  portfolioOrigins: () =>
    (process.env.PORTFOLIO_ALLOWED_ORIGINS || "https://sumandebnath.houseofnamus.com")
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean),
};
