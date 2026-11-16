import "server-only";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  supabaseUrl: () => req("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceKey: () => req("SUPABASE_SERVICE_ROLE_KEY"),
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
