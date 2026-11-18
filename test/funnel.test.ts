import { describe, expect, it } from "vitest";
import { branchFor, inboundCutoff, isWarm, pickTemplate, resumeDueAt, resumeStageFor, stageSideEffects, waitFor } from "@/lib/funnel";
import type { Lead, SequenceTemplate } from "@/lib/types";

const tpl = (p: Partial<SequenceTemplate>): SequenceTemplate => ({
  id: Math.random().toString(36),
  role_track: "HYBRID_DEFAULT",
  touch_number: 1,
  branch_variant: "STANDARD",
  subject_template: "s",
  body_template: "b",
  wait_business_days: 0,
  same_thread: true,
  created_at: "",
  ...p,
});

const TEMPLATES = [
  tpl({ touch_number: 1 }),
  tpl({ touch_number: 2, branch_variant: "WARM", wait_business_days: 3, subject_template: "warm" }),
  tpl({ touch_number: 2, branch_variant: "COLD", wait_business_days: 3, subject_template: "cold" }),
  tpl({ touch_number: 3, wait_business_days: 5 }),
  tpl({ touch_number: 4, wait_business_days: 6 }),
  tpl({ role_track: "AI_PM", touch_number: 3, wait_business_days: 7, subject_template: "pm-t3" }),
];

const lead = (p: Partial<Lead> = {}): Lead =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    funnel_stage: "OUTREACH_ACTIVE",
    sub_stage: null,
    current_touch: 1,
    next_touch_due_at: null,
    reengage_at: null,
    open_count: 0,
    click_count: 0,
    portfolio_visit_count: 0,
    created_at: "2026-11-02T00:00:00.000Z",
    replied_at: null,
    ...p,
  }) as Lead;

describe("warm intent & branching", () => {
  it("is warm on a click, a portfolio visit, or 2+ opens", () => {
    expect(isWarm({ click_count: 1, portfolio_visit_count: 0, open_count: 0 })).toBe(true);
    expect(isWarm({ click_count: 0, portfolio_visit_count: 1, open_count: 0 })).toBe(true);
    expect(isWarm({ click_count: 0, portfolio_visit_count: 0, open_count: 2 })).toBe(true);
    expect(isWarm({ click_count: 0, portfolio_visit_count: 0, open_count: 1 })).toBe(false);
  });

  it("only Touch 2 branches", () => {
    const warm = { click_count: 1, portfolio_visit_count: 0, open_count: 0 };
    const cold = { click_count: 0, portfolio_visit_count: 0, open_count: 1 };
    expect(branchFor(warm, 2)).toBe("WARM");
    expect(branchFor(cold, 2)).toBe("COLD");
    expect(branchFor(warm, 3)).toBe("STANDARD");
  });
});

describe("pickTemplate", () => {
  it("uses a role-track override when present, else inherits HYBRID_DEFAULT", () => {
    expect(pickTemplate(TEMPLATES, "AI_PM", 3, "STANDARD")?.subject_template).toBe("pm-t3");
    expect(pickTemplate(TEMPLATES, "BRAND", 3, "STANDARD")?.role_track).toBe("HYBRID_DEFAULT");
  });

  it("falls back to the other Touch 2 branch only when the requested one is missing", () => {
    const onlyCold = TEMPLATES.filter((t) => t.branch_variant !== "WARM");
    expect(pickTemplate(onlyCold, "BRAND", 2, "WARM")?.subject_template).toBe("cold");
    expect(pickTemplate(TEMPLATES, "BRAND", 2, "WARM")?.subject_template).toBe("warm");
  });

  it("reads waits from templates with sane defaults", () => {
    expect(waitFor(TEMPLATES, "AI_PM", 3)).toBe(7);
    expect(waitFor(TEMPLATES, "BRAND", 4)).toBe(6);
    expect(waitFor([], "BRAND", 2)).toBe(3);
  });
});

describe("inboundCutoff", () => {
  it("starts shortly before the first send", () => {
    const first = new Date("2026-11-03T05:00:00.000Z");
    expect(inboundCutoff(first, lead()).toISOString()).toBe("2026-11-03T04:50:00.000Z");
  });

  it("moves past an already-handled reply so resuming after an auto-reply sticks", () => {
    const first = new Date("2026-11-03T05:00:00.000Z");
    const replied = "2026-11-04T09:30:00.000Z";
    expect(inboundCutoff(first, lead({ replied_at: replied })).toISOString()).toBe(replied);
  });

  it("falls back to creation time when nothing was sent", () => {
    expect(inboundCutoff(undefined, lead()).toISOString()).toBe("2026-11-01T23:50:00.000Z");
  });
});

describe("resumeDueAt", () => {
  it("keeps the original schedule after an early auto-reply", () => {
    const t1 = new Date("2026-11-23T04:30:00Z"); // Mon 10:00 IST
    const now = new Date("2026-11-23T06:00:00Z"); // resumed 90 minutes later
    expect(resumeDueAt(t1, 3, "INDIA", now).toISOString()).toBe("2026-11-26T04:30:00.000Z"); // Thu 10:00 IST
  });

  it("is due immediately when the schedule has already passed", () => {
    const now = new Date("2026-12-10T06:00:00Z");
    expect(resumeDueAt(new Date("2026-11-23T04:30:00Z"), 3, "INDIA", now)).toEqual(now);
    expect(resumeDueAt(null, 3, "INDIA", now)).toEqual(now);
  });
});

describe("resumeStageFor", () => {
  it("returns warm leads to WARM_ENGAGED and unsent leads to LEAD_QUEUED", () => {
    expect(resumeStageFor(lead({ open_count: 3 }))).toBe("WARM_ENGAGED");
    expect(resumeStageFor(lead({ current_touch: 0 }))).toBe("LEAD_QUEUED");
    expect(resumeStageFor(lead({ current_touch: 2 }))).toBe("OUTREACH_ACTIVE");
  });
});

describe("stageSideEffects", () => {
  const now = new Date("2026-11-16T10:00:00.000Z");
  const settings = { reengage_after_days: 60 };

  it("stops the sequence and defaults the interview sub-stage", () => {
    const p = stageSideEffects(lead({ sequence_active: true }), "INTERVIEWING", settings, now);
    expect(p).toMatchObject({ sequence_active: false, next_touch_due_at: null, sub_stage: "HR_SCREEN" });
  });

  it("schedules a nurture re-engage date", () => {
    const p = stageSideEffects(lead(), "NURTURE_LATER", settings, now);
    expect(p.reengage_at).toBe("2027-01-15T10:00:00.000Z");
  });

  it("stamps archived_at and keeps an explicit closed sub-stage", () => {
    const p = stageSideEffects(lead({ sub_stage: "HIRED" }), "CLOSED_ARCHIVE", settings, now);
    expect(p).toMatchObject({ archived_at: now.toISOString(), sequence_active: false });
    expect(p.sub_stage).toBeUndefined();
    expect(stageSideEffects(lead(), "CLOSED_ARCHIVE", settings, now).sub_stage).toBe("REJECTED");
  });

  it("re-activates a sequence that still has touches left", () => {
    const p = stageSideEffects(lead({ funnel_stage: "NURTURE_LATER", sub_stage: "X", current_touch: 2 }), "OUTREACH_ACTIVE", settings, now);
    expect(p).toMatchObject({ sequence_active: true, next_touch_due_at: now.toISOString(), sub_stage: null });
    expect(stageSideEffects(lead({ current_touch: 4 }), "OUTREACH_ACTIVE", settings, now).sequence_active).toBeUndefined();
  });
});
