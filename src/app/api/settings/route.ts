import { db, getSettings, must } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { isGmailConfigured, refreshTokenFor } from "@/lib/server/gmail";
import { fail, ok, readJson, route } from "@/lib/server/http";
import { isResendConfigured } from "@/lib/server/resend";
import { isTelegramConfigured } from "@/lib/server/telegram";
import type { SystemSettings } from "@/lib/types";
import { EMAIL_RE } from "@/lib/utils";

export const dynamic = "force-dynamic";

function publicView(s: SystemSettings) {
  const { gmail_refresh_token, ...rest } = s;
  return {
    settings: rest,
    status: {
      gmailConnected: isGmailConfigured(s),
      gmailTokenSource: gmail_refresh_token ? "database" : refreshTokenFor(s) ? "env" : null,
      googleClientConfigured: Boolean(env.googleClientId() && env.googleClientSecret()),
      resendConfigured: isResendConfigured(),
      cronSecretSet: Boolean(env.cronSecret()),
      trackingSecretSet: Boolean(process.env.TRACKING_SECRET),
      dashboardAuth: Boolean(process.env.DASHBOARD_PASSWORD),
      appBaseUrl: env.appBaseUrl(),
      ownerTimezone: env.ownerTimezone(),
      portfolioOrigins: env.portfolioOrigins(),
      telegramConfigured: isTelegramConfigured(),
      digestTime: `${env.digestTime()} ${env.ownerTimezone()}`,
    },
  };
}

export const GET = route(async () => ok(publicView(await getSettings())));

const INT_FIELDS: [keyof SystemSettings, number, number][] = [
  ["daily_send_limit", 1, 500],
  // ≥ 1 minute so two overlapping queue runs can never share a dispatch slot
  ["min_delay_minutes", 1, 240],
  ["max_delay_minutes", 1, 240],
  ["india_window_start", 0, 23],
  ["india_window_end", 1, 24],
  ["us_window_start", 0, 23],
  ["us_window_end", 1, 24],
  ["global_window_start", 0, 23],
  ["global_window_end", 1, 24],
  ["archive_after_business_days", 0, 60],
  ["reengage_after_days", 1, 365],
];

export const PUT = route(async (req: Request) => {
  const body = await readJson<Partial<SystemSettings> & { disconnect_gmail?: boolean }>(req);
  const patch: Record<string, unknown> = {};

  if (body.send_provider !== undefined) {
    if (!["GMAIL", "RESEND"].includes(body.send_provider)) return fail("invalid send_provider");
    patch.send_provider = body.send_provider;
  }
  if (body.execution_mode !== undefined) {
    if (!["AUTO_PILOT", "APPROVAL_GATE"].includes(body.execution_mode)) return fail("invalid execution_mode");
    patch.execution_mode = body.execution_mode;
  }
  for (const [k, min, max] of INT_FIELDS) {
    if (body[k] === undefined) continue;
    const v = Number(body[k]);
    if (!Number.isInteger(v) || v < min || v > max) return fail(`${k} must be an integer between ${min} and ${max}`);
    patch[k] = v;
  }
  for (const k of ["sender_name", "portfolio_base_url", "resume_url"] as const) {
    if (body[k] === undefined) continue;
    const v = String(body[k]).replace(/[\r\n]+/g, " ").trim().slice(0, 500);
    if (!v) return fail(`${k} cannot be empty`);
    if (k !== "sender_name") {
      let u: URL | null = null;
      try {
        u = new URL(v);
      } catch {}
      if (!u || (u.protocol !== "https:" && u.protocol !== "http:")) return fail(`${k} must be an http(s) URL`);
    }
    patch[k] = v;
  }
  if (body.sender_email !== undefined) {
    const v = String(body.sender_email).trim().toLowerCase();
    if (!EMAIL_RE.test(v)) return fail("invalid sender_email");
    patch.sender_email = v;
  }
  if (body.disconnect_gmail) patch.gmail_refresh_token = null;

  const merged = { ...(await getSettings()), ...patch } as SystemSettings;
  if (merged.min_delay_minutes > merged.max_delay_minutes) return fail("min delay cannot exceed max delay");
  for (const g of ["india", "us", "global"] as const) {
    if (merged[`${g}_window_start`] >= merged[`${g}_window_end`]) return fail(`${g} window start must be before end`);
  }

  const res = await db().from("system_settings").update(patch).eq("id", 1).select("*").single();
  return ok(publicView(must(res, "save settings") as SystemSettings));
});
