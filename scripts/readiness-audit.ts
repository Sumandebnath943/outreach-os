/** Read-only live readiness checks. Never dispatches mail, runs the queue or changes records. */
import { writeFileSync, mkdirSync } from "node:fs";
import { db, getSettings, must } from "../src/lib/server/db";
import { env } from "../src/lib/server/env";
import { GMAIL_SCOPES, oauthClient, refreshTokenFor, gmailClient } from "../src/lib/server/gmail";
import { pickTemplate } from "../src/lib/funnel";
import { findUnresolved, mergeVars } from "../src/lib/render";
import { ROLE_TRACKS, type SequenceTemplate } from "../src/lib/types";

type Check = { name: string; ok: boolean; detail?: unknown };
const checks: Check[] = [];
async function check(name: string, fn: () => Promise<unknown>) {
  try { checks.push({ name, ok: true, detail: await fn() }); }
  catch { checks.push({ name, ok: false, detail: "Check failed; credentials and private payloads omitted." }); }
}
function assert(condition: unknown, message = "Check failed"): asserts condition {
  if (!condition) throw new Error(message);
}
const base = env.appBaseUrl();
const credentials = `Basic ${Buffer.from(`${process.env.DASHBOARD_USER || "admin"}:${process.env.DASHBOARD_PASSWORD || ""}`).toString("base64")}`;
const get = (path: string, authenticated = true, headers: Record<string, string> = {}) => fetch(base + path, {
  headers: { ...(authenticated ? { Authorization: credentials } : {}), ...headers },
  redirect: "manual", signal: AbortSignal.timeout(25_000),
});

async function main() {
  await check("Production configuration", async () => {
    assert(new URL(base).protocol === "https:");
    assert(process.env.DASHBOARD_PASSWORD && process.env.CRON_SECRET && process.env.TRACKING_SECRET);
    return { https: true, dashboardPassword: true, cronSecret: true, trackingSecret: true };
  });
  for (const path of ["/api/leads", "/api/settings", "/api/templates", "/api/approvals", "/api/prechecks", "/api/analytics", "/api/imports"]) {
    await check(`Unauthenticated ${path}`, async () => {
      const response = await get(path, false); assert(response.status === 401); return { status: response.status };
    });
  }
  for (const path of ["/api/stats", "/api/settings", "/api/templates", "/api/approvals", "/api/prechecks", "/api/leads", "/api/imports", "/api/analytics?range=30"]) {
    await check(`Authenticated ${path}`, async () => {
      const response = await get(path); assert(response.ok);
      const text = await response.text(); const payload = JSON.parse(text);
      assert(!text.includes("gmail_refresh_token") && !payload.error);
      return { status: response.status, ...(typeof payload.total === "number" ? { total: payload.total } : {}) };
    });
  }
  await check("Unauthorized cron cannot dispatch", async () => {
    const response = await get("/api/cron/process-queue", false); assert(response.status === 401); return { status: response.status };
  });
  // A cross-site request is rejected in middleware before any handler can run.
  await check("Cross-site queue request is blocked", async () => {
    const response = await fetch(base + "/api/queue/run", {
      method: "POST", headers: { Authorization: credentials, Origin: "https://untrusted.invalid", "Sec-Fetch-Site": "cross-site" },
      signal: AbortSignal.timeout(25_000),
    });
    assert(response.status === 403); return { status: response.status };
  });
  await check("Security headers", async () => {
    const response = await get("/", false);
    assert(response.headers.get("x-content-type-options") === "nosniff");
    assert(response.headers.get("x-frame-options") === "DENY");
    return { nosniff: true, frameProtection: true };
  });
  await check("Required database schema", async () => {
    for (const [table, columns] of [
      ["leads", "id,deleted_at,email_check_status,email_check_next_at,last_reply_checked_at,is_test,import_batch_id"],
      ["import_batches", "id,status,summary"], ["suppressed_addresses", "email,reason"],
      ["email_logs", "id,lead_id,is_test,status"],
    ]) must(await db().from(table).select(columns).limit(1), `inspect ${table}`);
    return { managementSchema: true, precheckSchema: true };
  });
  const settings = await getSettings();
  await check("Lead inventory and scheduler", async () => {
    const active = await db().from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null);
    const trash = await db().from("leads").select("id", { count: "exact", head: true }).not("deleted_at", "is", null);
    must(active, "count active"); must(trash, "count trash");
    assert(settings.last_queue_run_at && Date.now() - Date.parse(settings.last_queue_run_at) < 90 * 60_000);
    return { leads: active.count, trash: trash.count, executionMode: settings.execution_mode, lastQueueRunAt: settings.last_queue_run_at };
  });
  await check("Gmail token, scopes and profile", async () => {
    const auth = oauthClient(); auth.setCredentials({ refresh_token: refreshTokenFor(settings) });
    const access = await auth.getAccessToken(); assert(access.token);
    const info = await auth.getTokenInfo(access.token);
    assert(GMAIL_SCOPES.every(scope => info.scopes.includes(scope)));
    const profile = await gmailClient(settings)!.users.getProfile({ userId: "me" });
    assert(profile.data.emailAddress?.toLowerCase() === settings.sender_email.toLowerCase());
    return { tokenValid: true, requiredScopes: true, senderMatches: true };
  });
  await check("All track and touch templates render", async () => {
    const templates = must(await db().from("sequence_templates").select("*"), "load templates") as SequenceTemplate[];
    let rendered = 0;
    for (const track of ROLE_TRACKS) for (const [touch, variant] of [[1,"STANDARD"],[2,"WARM"],[2,"COLD"],[3,"STANDARD"],[4,"STANDARD"]] as const) {
      const template = pickTemplate(templates, track, touch, variant); assert(template);
      const lead = { id: "00000000-0000-4000-8000-000000000001", first_name: "Alex", last_name: "Example", email: "alex@example.com", company_name: "Example", target_role_opening: "Example role", custom_icebreaker: "An example introduction.", job_title: "Hiring manager", role_track: track, geo_region: "INDIA" as const };
      const subject = mergeVars(template.subject_template, lead, { originalSubject: "Example subject" });
      const body = mergeVars(template.body_template, lead, { originalSubject: "Example subject", signature: settings.email_signature });
      assert(findUnresolved(subject + "\n" + body).length === 0); rendered++;
    }
    return { rendered, recipientsContacted: 0 };
  });
  if (env.telegramBotToken()) await check("Telegram connection (no alert sent)", async () => {
    for (const endpoint of ["getMe", `getChat?chat_id=${encodeURIComponent(env.telegramChatId())}`]) {
      const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken()}/${endpoint}`, { signal: AbortSignal.timeout(15_000) });
      const payload = await response.json(); assert(response.ok && payload.ok);
    }
    return { tokenValid: true, chatAccessible: true };
  });
  if (env.groqApiKey()) await check("AI connection and configured model", async () => {
    const response = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${env.groqApiKey()}` }, signal: AbortSignal.timeout(15_000) });
    const payload = await response.json(); assert(response.ok && payload.data?.some((m: { id: string; active?: boolean }) => m.id === env.groqModel() && m.active !== false));
    return { modelAvailable: true };
  });
  mkdirSync("test-results", { recursive: true });
  const report = { at: new Date().toISOString(), checks, passed: checks.filter(c => c.ok).length, failed: checks.filter(c => !c.ok).length, emailsSent: 0, recordsChanged: 0 };
  writeFileSync("test-results/readiness-live.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.failed) process.exitCode = 1;
}
main().catch(() => { console.error("Read-only readiness audit failed; credentials omitted."); process.exitCode = 1; });
