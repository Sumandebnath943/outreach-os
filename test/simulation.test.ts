/**
 * End-to-end pipeline simulation. Real OutreachOS server code, in-memory database and
 * Gmail, fast-forwarded clock. Writes a readable timeline to test-results/simulation-report.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { differenceInBusinessDays } from "date-fns";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://sim.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_simulation",
    GOOGLE_CLIENT_ID: "sim-client",
    GOOGLE_CLIENT_SECRET: "sim-secret",
    APP_BASE_URL: "https://outreachos.houseofnamus.com",
    TRACKING_SECRET: "sim-tracking-secret",
    OWNER_TIMEZONE: "Asia/Kolkata",
  });
});

vi.mock("@supabase/supabase-js", async () => {
  const { state } = await import("./sim/state");
  return {
    createClient: () => ({
      from: (t: string) => state.db.from(t),
      rpc: (n: string, a: Record<string, unknown>) => state.db.rpc(n, a),
    }),
  };
});

vi.mock("@googleapis/gmail", async () => {
  const { state } = await import("./sim/state");
  class OAuth2 {
    setCredentials() {}
    generateAuthUrl() {
      return "https://accounts.google.com/o/oauth2/auth";
    }
  }
  return { auth: { OAuth2 }, gmail: () => state.gmail.client() };
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  const { state } = await import("./sim/state");
  return { ...actual, after: (fn: () => unknown) => void state.after.push(fn) };
});

import { processQueue } from "@/lib/server/sequencer";
import { alias, CHROME_UA, DAY, defaultLead, fmt, GMAIL_PROXY_UA, LEAD_EMAIL, SCANNER_UA, Sim } from "./sim/harness";

const HOUR = 60 * 60 * 1000;
const MON_0830_IST = "2026-11-23T03:00:00.000Z"; // Mon 23 Nov 2026, 08:30 IST — before the 10:00 window

const report: { title: string; result: string[]; timeline: string[] }[] = [];
function record(sim: Sim, result: string[]) {
  report.push({ title: sim.title, result, timeline: sim.timeline });
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterAll(() => {
  vi.useRealTimers();
  const md = [
    "# OutreachOS · end-to-end simulation report",
    "",
    `Generated ${new Date().toISOString()} by \`npm run simulate\`. Real server code (worker, API routes, tracking endpoints) against an`,
    "in-memory database and Gmail mailbox, with the clock fast-forwarded on the production cron cadence (every 10 minutes, Mon–Fri).",
    "Nothing is sent and no real database is touched.",
    "",
    ...report.flatMap((s) => [`## ${s.title}`, "", ...s.result.map((r) => `- ✅ ${r}`), "", "| When | What happened |", "|---|---|", ...s.timeline, ""]),
  ].join("\n");
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/simulation-report.md", md);
});

describe("end-to-end pipeline simulation", () => {
  it("S1 · no reply: T1 → T2B → T3 → T4 in one thread, auto-archived as GHOSTED on business day 18", async () => {
    const sim = new Sim("S1 · No reply: full 4-touch sequence, then auto-archive", MON_0830_IST);
    const imported = await sim.importLead();
    expect(imported.results[0]).toMatchObject({ status: "NEW", lead: { role_track: "AI_PMM", geo_region: "INDIA" } });

    await sim.runUntil(() => sim.lead().funnel_stage === "CLOSED_ARCHIVE", 40);
    const lead = sim.lead();
    const sends = sim.sentLogs().map((l) => l.sent_at);

    expect(sim.touches()).toEqual(["T1", "T2B", "T3", "T4"]);
    expect(sends).toEqual([
      "2026-11-23T04:30:00.000Z", // Mon 10:00 IST — first moment inside the window
      "2026-11-26T04:30:00.000Z", // +3 business days
      "2026-12-03T04:30:00.000Z", // +5
      "2026-12-11T04:30:00.000Z", // +6
    ]);
    expect(lead).toMatchObject({ sub_stage: "GHOSTED", sequence_active: false, next_touch_due_at: null });
    expect(lead.archived_at).toBe("2026-12-17T04:30:00.000Z");
    expect(differenceInBusinessDays(new Date(lead.archived_at!), new Date(sends[0]))).toBe(18);

    // Threading: one Gmail thread, RFC 2822 chain intact, "Re: <original subject>"
    const msgs = sim.gmail.sentTo(LEAD_EMAIL);
    const h = (i: number, n: string) => sim.gmail.header(msgs[i], n);
    expect(new Set(msgs.map((m) => m.threadId)).size).toBe(1);
    for (let i = 1; i < 4; i++) {
      expect(h(i, "In-Reply-To")).toBe(h(i - 1, "Message-ID"));
      expect(h(i, "Subject")).toBe(`Re: ${h(0, "Subject")}`);
    }
    expect(h(3, "References").split(" ")).toEqual([h(0, "Message-ID"), h(1, "Message-ID"), h(2, "Message-ID")]);

    // Copy & links
    expect(msgs[0].text).toMatch(/^Hi Suman,/);
    expect(msgs[0].text).not.toMatch(/\+91|7980/);
    expect(msgs[0].text).toContain("utm_source=outreachos&utm_medium=email&utm_campaign=acme-ai&utm_term=suman-test&utm_content=outreach_active-t1");
    expect(msgs[3].text).toContain("utm_content=outreach_active-t4");
    expect(msgs[0].html).toContain("/api/track/open?l=");
    for (const s of sends) expect([1, 2, 3, 4, 5]).toContain(new Date(s).getUTCDay());

    record(sim, [
      "4 touches sent T1 → T2B (cold, no engagement) → T3 → T4, only Mon–Fri at 10:00 IST",
      "Waits of 3 / 5 / 6 business days; archived as GHOSTED exactly 18 business days after T1",
      "All follow-ups in the same Gmail thread: In-Reply-To + References chain, “Re: <original subject>”",
      "Links carry ?ref=<lead> and UTMs (acme-ai / suman-test / outreach_active-t1…t4); no phone number in the copy",
    ]);
  });

  it("S2 · warm path: human click → WARM_ENGAGED → Touch 2A, UTM stage restamped at click time", async () => {
    const sim = new Sim("S2 · Warm path: click + portfolio browsing switch Touch 2 to the warm branch", MON_0830_IST);
    await sim.importLead();
    await sim.runUntil(() => sim.touches().length === 1);
    const lead = sim.lead();

    sim.advance(2 * HOUR);
    const landed = await sim.click("portfolio");
    expect(landed.origin).toBe("https://sumandebnath.houseofnamus.com");
    expect(Object.fromEntries(landed.searchParams)).toEqual({
      ref: lead.id,
      utm_source: "outreachos",
      utm_medium: "email",
      utm_campaign: "acme-ai",
      utm_term: "suman-test",
      utm_content: "outreach_active-t1", // stage where the click happened
    });
    expect(sim.lead()).toMatchObject({ funnel_stage: "WARM_ENGAGED", click_count: 1 });

    await sim.portfolioView("/agents/migi", 84);
    await sim.portfolioView("/resume", 41);
    const resume = await sim.click("resume");
    expect(resume.pathname).toBe("/resume");
    expect(resume.searchParams.get("utm_content")).toBe("warm_engaged-t1"); // now warm

    const warm = sim.lead();
    expect(warm.portfolio_pages_viewed).toEqual(["/agents/migi", "/resume"]);
    expect(warm.portfolio_visit_count).toBe(2);
    const migi = sim.events().find((e) => e.event_type === "PORTFOLIO_VIEW" && e.metadata.path === "/agents/migi");
    expect(migi?.metadata.durationSec).toBe(84);
    expect(sim.events().filter((e) => e.event_type === "STAGE_CHANGE" && e.metadata.to === "WARM_ENGAGED")).toHaveLength(1);

    await sim.runUntil(() => sim.touches().length === 2);
    expect(sim.touches()).toEqual(["T1", "T2A"]);
    const t2a = sim.gmail.sentTo(LEAD_EMAIL)[1];
    expect(t2a.text).toContain("2-minute live walkthrough");
    expect(t2a.text).toContain("utm_content=warm_engaged-t2a");

    record(sim, [
      "A real (Chrome) click 2h after T1 promoted the lead to WARM_ENGAGED exactly once",
      "Landing URL carried ref + utm_campaign=acme-ai, utm_term=suman-test, utm_content=outreach_active-t1 (stage at click)",
      "Portfolio beacon logged /agents/migi (84s) and /resume (41s); later clicks were stamped warm_engaged-t1",
      "Touch 2 switched to the warm branch (T2A walkthrough offer), links stamped warm_engaged-t2a",
    ]);
  });

  it("S3 · bots ignored (cold branch); two genuine opens later promote to WARM", async () => {
    const sim = new Sim("S3 · Security scanners & prefetch ignored; genuine opens still count", MON_0830_IST);
    await sim.importLead();
    await sim.runUntil(() => sim.touches().length === 1);

    sim.advance(20_000);
    await sim.click("portfolio", CHROME_UA); // 20s after delivery → link pre-check
    sim.advance(10_000);
    await sim.open(GMAIL_PROXY_UA); // 30s after delivery → prefetch
    sim.advance(10 * 60_000);
    await sim.click("portfolio", SCANNER_UA); // Mimecast
    const bots = sim.events().filter((e) => e.metadata.bot);
    expect(bots.map((e) => e.metadata.botReason)).toEqual(["within_grace_period", "within_grace_period", "scanner_user_agent"]);
    expect(sim.lead()).toMatchObject({ funnel_stage: "OUTREACH_ACTIVE", click_count: 0, open_count: 0 });

    await sim.runUntil(() => sim.touches().length === 2);
    expect(sim.touches()).toEqual(["T1", "T2B"]);
    expect(sim.gmail.sentTo(LEAD_EMAIL)[1].text).toContain("Floating this back to the top of your inbox");

    sim.advance(3 * HOUR);
    await sim.open();
    expect(sim.lead()).toMatchObject({ open_count: 1, funnel_stage: "OUTREACH_ACTIVE" });
    sim.advance(2 * HOUR);
    await sim.open();
    expect(sim.lead()).toMatchObject({ open_count: 2, funnel_stage: "WARM_ENGAGED" });

    record(sim, [
      "Click 20s after delivery, open 30s after delivery and a Mimecast click were logged as bots — no counters, no promotion",
      "With no genuine engagement Touch 2 took the cold branch (T2B)",
      "Two real opens hours later promoted the lead to WARM_ENGAGED",
    ]);
  });

  it("S4 · positive reply stops the sequence; triage → interviewing → offer", async () => {
    const sim = new Sim("S4 · Positive reply: kill-switch, then interview and offer", MON_0830_IST);
    await sim.importLead();
    await sim.runUntil(() => sim.touches().length === 2);

    sim.advance(DAY); // Fri morning IST
    sim.reply("Sounds good — let's talk. Are you free Thursday at 3pm IST?");
    await sim.cron();
    expect(sim.lead()).toMatchObject({ funnel_stage: "REPLIED_TRIAGE", reply_sentiment: "POSITIVE", sequence_active: false, next_touch_due_at: null });
    expect(sim.lead().reply_snippet).toContain("Thursday at 3pm");
    expect(sim.events().some((e) => e.event_type === "REPLY_RECEIVED")).toBe(true);

    await sim.runFor(25);
    expect(sim.touches()).toEqual(["T1", "T2B"]);

    expect(await sim.patch({ funnel_stage: "INTERVIEWING" })).toMatchObject({ funnel_stage: "INTERVIEWING", sub_stage: "HR_SCREEN" });
    expect(await sim.patch({ sub_stage: "FINAL_ROUND", notes: "Panel with VP Marketing + CPO" })).toMatchObject({ sub_stage: "FINAL_ROUND" });
    expect(await sim.patch({ funnel_stage: "OFFER_STAGE" })).toMatchObject({ funnel_stage: "OFFER_STAGE", sequence_active: false });

    record(sim, [
      "Reply detected on the next cron run → REPLIED_TRIAGE, labelled POSITIVE, sequence stopped",
      "No further emails over the following 25 days",
      "Dashboard moves: Interviewing (HR_SCREEN → FINAL_ROUND) → Offer & Closing",
    ]);
  });

  it("S5 · out-of-office: resume keeps the original schedule; a later 'not interested' closes the lead", async () => {
    const sim = new Sim("S5 · Out-of-office reply, resume, then a negative reply", MON_0830_IST);
    await sim.importLead();
    await sim.runUntil(() => sim.touches().length === 1);

    sim.advance(HOUR);
    sim.reply("Automatic reply: I'm out of the office until Monday with limited access to email.");
    await sim.cron();
    expect(sim.lead()).toMatchObject({ funnel_stage: "REPLIED_TRIAGE", reply_sentiment: "OUT_OF_OFFICE" });

    const resumed = await sim.patch({ action: "resume_sequence" });
    expect(resumed).toMatchObject({ funnel_stage: "OUTREACH_ACTIVE", sequence_active: true });
    expect(resumed.next_touch_due_at).toBe("2026-11-26T04:30:00.000Z"); // original T1 + 3 business days, not "now"

    await sim.runFor(1);
    expect(sim.lead().funnel_stage).toBe("OUTREACH_ACTIVE"); // the old auto-reply does not re-trigger

    await sim.runUntil(() => sim.touches().length === 3);
    expect(sim.touches()).toEqual(["T1", "T2B", "T3"]);
    expect(sim.sentLogs()[1].sent_at).toBe("2026-11-26T04:30:00.000Z");

    sim.advance(2 * HOUR);
    sim.reply("Thanks Suman, but we're not interested at this time.");
    await sim.cron();
    expect(sim.lead()).toMatchObject({ funnel_stage: "REPLIED_TRIAGE", reply_sentiment: "NEGATIVE" });

    const closed = await sim.patch({ funnel_stage: "CLOSED_ARCHIVE", sub_stage: "REJECTED" });
    expect(closed).toMatchObject({ sub_stage: "REJECTED" });
    expect(closed.archived_at).not.toBeNull();
    await sim.runFor(20);
    expect(sim.touches()).toHaveLength(3);

    record(sim, [
      "Auto-reply 1h after T1 → triage, labelled OUT_OF_OFFICE",
      "Resume kept the original schedule: T2 due Thu 10:00 IST (T1 + 3 business days), not immediately",
      "The same auto-reply did not re-trigger the kill-switch; T2B and T3 went out on schedule",
      "“Not interested” after T3 → triage NEGATIVE → closed as REJECTED; nothing sent afterwards",
    ]);
  });

  it("S6 · 'no headcount' → nurture → resurfaced to triage after 60 days", async () => {
    const sim = new Sim("S6 · Not now: nurture and automatic re-engagement", MON_0830_IST);
    await sim.importLead();
    await sim.runUntil(() => sim.touches().length === 1);
    sim.advance(3 * HOUR);
    sim.reply("No headcount right now — please check back next quarter.");
    await sim.cron();
    expect(sim.lead().reply_sentiment).toBe("NOT_NOW");

    const nurtured = await sim.patch({ funnel_stage: "NURTURE_LATER" });
    expect(new Date(nurtured.reengage_at!).getTime() - Date.now()).toBe(60 * DAY);
    await sim.runUntil(() => sim.lead().funnel_stage === "REPLIED_TRIAGE", 70);
    expect(sim.lead()).toMatchObject({ sub_stage: "REENGAGE_DUE", reengage_at: null });
    expect(sim.touches()).toEqual(["T1"]);

    record(sim, [
      "Reply labelled NOT_NOW; moved to Nurture with a re-engage date 60 days out",
      "On that date the worker resurfaced the lead to triage (REENGAGE_DUE) without sending anything",
    ]);
  });

  it("S7 · bounce archives the lead and locks the address against re-import", async () => {
    const sim = new Sim("S7 · Hard bounce", MON_0830_IST);
    await sim.importLead();
    await sim.runUntil(() => sim.touches().length === 1);
    sim.advance(5 * 60_000);
    sim.bounce();
    await sim.cron();
    expect(sim.lead()).toMatchObject({ funnel_stage: "CLOSED_ARCHIVE", sub_stage: "BOUNCED", sequence_active: false });
    expect(sim.logs()[0].status).toBe("BOUNCED");

    const again = await sim.importLead();
    expect(again.results[0]).toMatchObject({ status: "DUPLICATE_EXISTING", locked: true });
    await sim.runFor(10);
    expect(sim.touches()).toHaveLength(1);

    record(sim, [
      "Mailer-daemon notice in the thread → CLOSED_ARCHIVE / BOUNCED, email log marked BOUNCED",
      "Re-importing the same address is reported as LOCKED; nothing further is sent",
    ]);
  });

  it("S8 · a reply sent as a brand-new email (not in the thread) is still caught", async () => {
    const sim = new Sim("S8 · Reply arrives as a new email, outside the thread", MON_0830_IST);
    await sim.importLead();
    await sim.runUntil(() => sim.touches().length === 2);
    sim.advance(4 * HOUR);
    sim.reply("Hi Suman — saw your note. Could you send your CV? Happy to set up a call.", { inThread: false });
    await sim.cron();
    expect(sim.lead()).toMatchObject({ funnel_stage: "REPLIED_TRIAGE", reply_sentiment: "POSITIVE" });
    record(sim, ["Mailbox search (from:<lead> after first send) caught the out-of-thread email → triage POSITIVE"]);
  });

  it("S9 · late reply within 30 days of archiving returns to triage; after 30 days it is ignored", async () => {
    const sim = new Sim("S9 · Late replies after auto-archive", MON_0830_IST);
    const late = alias("late");
    await sim.importLead();
    await sim.importLead(defaultLead({ email: late, first_name: "Late", company_name: "Globex" }));
    await sim.runUntil(() => [LEAD_EMAIL, late].every((e) => sim.lead(e).funnel_stage === "CLOSED_ARCHIVE"), 40);
    expect(sim.lead(late).sub_stage).toBe("GHOSTED");

    sim.advance(12 * DAY); // a Monday, 12 days after archiving
    sim.reply("Sorry for the slow reply — is this still something you're exploring?");
    await sim.cron();
    expect(sim.lead()).toMatchObject({ funnel_stage: "REPLIED_TRIAGE", sub_stage: "LATE_REPLY" });

    sim.advance(21 * DAY); // 33 days after archiving
    sim.reply("Circling back on this.", { email: late });
    await sim.runFor(1);
    expect(sim.lead(late)).toMatchObject({ funnel_stage: "CLOSED_ARCHIVE", sub_stage: "GHOSTED" });

    record(sim, [
      "Both leads were ghosted after T4 (+4 business days)",
      "Reply 12 days after archiving → REPLIED_TRIAGE / LATE_REPLY",
      "Reply 33 days after archiving is outside the 30-day watch and left alone",
    ]);
  });

  it("S10 · approval gate: nothing goes out unapproved; an edited draft is sent verbatim with tracked links", async () => {
    const sim = new Sim("S10 · Approval Gate mode with an edited draft", MON_0830_IST, { execution_mode: "APPROVAL_GATE" });
    await sim.importLead();
    await sim.runFor(1);
    expect(sim.touches()).toEqual([]);

    await sim.approvals({
      action: "save_draft",
      leadId: sim.lead().id,
      subject: "Quick question about AI PMM at Acme AI",
      body: "Hi Suman,\n\nShort edited note for this test.\n\nPortfolio: {{tracked_portfolio_url}}\n\nBest,\nSuman",
    });
    await sim.approvals({ action: "approve", leadIds: [sim.lead().id] });
    await sim.runUntil(() => sim.touches().length === 1);
    const t1 = sim.gmail.sentTo(LEAD_EMAIL)[0];
    expect(sim.gmail.header(t1, "Subject")).toBe("Quick question about AI PMM at Acme AI");
    expect(t1.text).toContain("Short edited note for this test.");
    expect(t1.text).toContain("utm_content=outreach_active-t1");
    expect(sim.lead().approval_status).toBe("PENDING");

    await sim.runFor(5);
    expect(sim.touches()).toHaveLength(1); // T2 is due but waits for approval
    await sim.approvals({ action: "approve", leadIds: [sim.lead().id] });
    await sim.runUntil(() => sim.touches().length === 2);

    record(sim, [
      "A full day of cron runs sent nothing until the touch was approved",
      "The edited subject/body went out verbatim, with the tracked portfolio link + UTMs added",
      "Approval reset to PENDING after sending; T2 waited (overdue) until approved again",
    ]);
  });

  it("S11 · US lead imported Friday evening goes out Monday 09:00 New York time", async () => {
    const sim = new Sim("S11 · US send window and weekend", "2026-11-27T22:05:00.000Z", {}, { zone: "America/New_York", label: "ET" });
    await sim.importLead(defaultLead({ geo_region: "US", company_name: "Nimbus Labs" }));
    await sim.runUntil(() => sim.touches().length === 1);
    expect(sim.sentLogs()[0].sent_at).toBe("2026-11-30T14:00:00.000Z");
    expect(fmt(sim.sentLogs()[0].sent_at, "America/New_York", "ET")).toBe("Mon 30 Nov 2026 09:00 ET");
    record(sim, ["Imported Fri 17:05 ET — held over the weekend, sent Mon 09:00 ET (first minute of the US window)"]);
  });

  it("S12 · daily cap and jitter: 5 leads with a cap of 3 → 3 today, 2 tomorrow, never in the same slot", async () => {
    const sim = new Sim("S12 · Daily send cap and human jitter", MON_0830_IST, { daily_send_limit: 3 });
    const leads = [1, 2, 3, 4, 5].map((i) => alias(`q${i}`));
    for (const [i, email] of leads.entries()) await sim.importLead(defaultLead({ email, first_name: `Q${i + 1}`, company_name: `Company ${i + 1}` }));
    const total = () => leads.reduce((n, e) => n + sim.touches(e).length, 0);

    await sim.runUntil(() => total() === 3);
    await sim.runFor(0.3); // rest of the Indian business day
    expect(total()).toBe(3);
    await sim.runUntil(() => total() === 5);

    const times = leads.flatMap((e) => sim.sentLogs(e).map((l) => new Date(l.sent_at).getTime())).sort();
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(3 * 60_000);
    const day = (t: number) => new Date(t).toISOString().slice(0, 10);
    expect(times.map(day)).toEqual(["2026-11-23", "2026-11-23", "2026-11-23", "2026-11-24", "2026-11-24"]);

    record(sim, ["Cap of 3 respected: 3 sends on Monday, the remaining 2 on Tuesday", "Every send at least one jitter slot (≥3 min) apart"]);
  });

  it("S13 · two overlapping worker runs with zero jitter never double-send", async () => {
    const sim = new Sim("S13 · Overlapping runs (cron + dashboard button at the same moment)", "2026-11-23T04:30:00.000Z", {
      min_delay_minutes: 0,
      max_delay_minutes: 0,
    });
    await sim.importLead();
    const [a, b] = await Promise.all([processQueue("cron"), processQueue("manual")]);
    expect(a.sent.length + b.sent.length).toBe(1);
    expect(sim.gmail.sentTo(LEAD_EMAIL)).toHaveLength(1);
    sim.note("Two worker runs started simultaneously; the per-lead claim let exactly one of them send");
    record(sim, ["Exactly one email sent even though both runs got a dispatch slot"]);
  });

  it("S14 · revoked Gmail token pauses everything cleanly and resumes after reconnecting", async () => {
    const sim = new Sim("S14 · Gmail token revoked mid-sequence", MON_0830_IST);
    await sim.importLead();
    await sim.runUntil(() => sim.touches().length === 1);
    sim.gmail.authRevoked = true;
    sim.note("Gmail access revoked (e.g. password change)");

    const reports = await sim.runFor(4);
    expect(sim.touches()).toEqual(["T1"]);
    expect(sim.logs().filter((l) => l.status === "FAILED")).toHaveLength(0);
    const last = await sim.cron();
    expect(last.notes.join(" ")).toMatch(/reconnect Gmail/);
    expect(reports.every((r) => r.sent.length === 0)).toBe(true);

    sim.gmail.authRevoked = false;
    sim.note("Gmail reconnected in Settings");
    await sim.runUntil(() => sim.touches().length === 2);
    record(sim, [
      "While revoked: no sends, no FAILED-log spam, one clear “reconnect Gmail” note per run",
      "After reconnecting, the overdue T2 went out on the next run",
    ]);
  });

  it("S15 · transient failure retries after an hour; an invalid recipient is archived as BOUNCED", async () => {
    const sim = new Sim("S15 · Send failures", MON_0830_IST);
    await sim.importLead();
    sim.gmail.sendFailures.push(new Error("socket hang up"));
    await sim.runUntil(() => sim.touches().length === 1);
    expect(sim.logs().map((l) => l.status)).toEqual(["FAILED", "SENT"]);
    expect(sim.sentLogs()[0].sent_at).toBe("2026-11-23T05:30:00.000Z"); // retried 1h later

    const bad = alias("bad");
    await sim.importLead(defaultLead({ email: bad, company_name: "Initech" }));
    sim.gmail.sendFailures.push(new Error("Invalid To header"));
    await sim.runUntil(() => sim.lead(bad).funnel_stage === "CLOSED_ARCHIVE");
    expect(sim.lead(bad).sub_stage).toBe("BOUNCED");
    record(sim, ["“socket hang up” → FAILED log, retried 1h later and sent", "“Invalid To header” → archived as BOUNCED immediately"]);
  });

  it("S17 · analytics: a mixed 5-lead campaign produces the expected rates, funnel and touch breakdown", async () => {
    const sim = new Sim("S17 · Mixed campaign → Analytics page numbers", MON_0830_IST);
    const [a1, a2, a3, a4, a5] = ["reply", "bounce", "engaged", "silent", "ooo"].map(alias);
    for (const [i, email] of [a1, a2, a3, a4, a5].entries())
      await sim.importLead(defaultLead({ email, first_name: `Lead${i + 1}`, company_name: `Company ${i + 1}`, geo_region: i === 3 ? "US" : "INDIA" }));
    const all = [a1, a2, a3, a4, a5];
    await sim.runUntil(() => all.filter((e) => e !== a4).every((e) => sim.touches(e).length === 1));

    sim.advance(2 * 60 * 60 * 1000);
    await sim.open(GMAIL_PROXY_UA, a3);
    await sim.click("portfolio", CHROME_UA, a3);
    await sim.portfolioView("/agents/migi", 60, a3);
    sim.reply("Interesting profile — let's set up a call next week.", { email: a1 });
    sim.bounce(a2);
    sim.reply("Automatic reply: I'm on leave until 1 December.", { email: a5 });
    await sim.cron();
    await sim.patch({ action: "resume_sequence" }, a5);
    await sim.patch({ funnel_stage: "INTERVIEWING" }, a1);
    await sim.runUntil(() => all.every((e) => !sim.lead(e).sequence_active), 40);

    const { GET } = await import("@/app/api/analytics/route");
    const { NextRequest } = await import("next/server");
    const a = await (await GET(new NextRequest("https://outreachos.houseofnamus.com/api/analytics?range=all"))).json();

    expect(a.totals).toMatchObject({ sent: 14, delivered: 13, bounced: 1, contacted: 5 });
    expect(a.totals.open).toMatchObject({ n: 1, d: 13 });
    expect(a.totals.click).toMatchObject({ n: 1, d: 13 });
    expect(a.totals.reply).toMatchObject({ n: 1, d: 5 }); // out-of-office is not a reply
    expect(a.totals.positive).toMatchObject({ n: 1, d: 5 });
    expect(a.totals.bounce).toMatchObject({ n: 1, d: 14 });
    expect(a.totals.portfolio).toMatchObject({ n: 1, d: 5 });
    expect(Object.fromEntries(a.funnel.map((f: { stage: string; leads: number }) => [f.stage, f.leads]))).toEqual({
      CONTACTED: 5,
      WARM_ENGAGED: 2,
      REPLIED: 1,
      INTERVIEWING: 1,
      OFFER_STAGE: 0,
    });
    expect(a.byTouch.map((r: { key: string; sent: number; replies: number }) => [r.key, r.sent, r.replies])).toEqual([
      ["T1", 5, 1],
      ["T2A", 1, 0],
      ["T2B", 2, 0],
      ["T3", 3, 0],
      ["T4", 3, 0],
    ]);
    expect(a.byGeo.map((r: { key: string; contacted: number }) => [r.key, r.contacted])).toEqual([
      ["INDIA", 4],
      ["US", 1],
    ]);

    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/analytics-sample.json", JSON.stringify(a, null, 2)); // sample payload for UI checks
    const t = a.totals;
    const p = (r: { n: number; d: number }) => `${((r.n / r.d) * 100).toFixed(1)}% (${r.n}/${r.d})`;
    sim.note(
      `Analytics → open ${p(t.open)} · click ${p(t.click)} · reply ${p(t.reply)} · positive ${p(t.positive)} · bounce ${p(t.bounce)} · portfolio ${p(t.portfolio)}`,
    );
    record(sim, [
      "14 emails / 13 delivered / 5 leads contacted, exactly as the story implies",
      "Out-of-office auto-reply excluded from the reply rate; the bounce counted in bounce rate only",
      "Funnel: 5 contacted → 2 engaged → 1 replied → 1 interviewing; replies credited to T1",
      "Touch breakdown T1 5 · T2A 1 · T2B 2 · T3 3 · T4 3; geo breakdown INDIA 4 · US 1",
    ]);
  });

  it("S16 · email sent but the database write fails → lead paused, never sent twice", async () => {
    const sim = new Sim("S16 · Sent, but recording it failed", MON_0830_IST);
    await sim.importLead();
    sim.db.failNext("email_logs", "upsert", 3);
    await sim.runUntil(() => sim.gmail.sentTo(LEAD_EMAIL).length === 1);
    expect(sim.lead()).toMatchObject({ approval_status: "PAUSED", next_touch_due_at: null, current_touch: 0 });
    await sim.runFor(5);
    expect(sim.gmail.sentTo(LEAD_EMAIL)).toHaveLength(1);
    record(sim, ["Write retried 3×, then the lead was paused with a clear error — no duplicate email over the next 5 days"]);
  });
});
