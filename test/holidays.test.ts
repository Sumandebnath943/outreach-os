import { describe, expect, it } from "vitest";
import { effectiveDailyLimit } from "@/lib/funnel";
import { holidayOn, parseBlackoutDates, upcomingHolidays } from "@/lib/holidays";
import { addBusinessDaysInTz, isInSendWindow, nextBusinessMorning } from "@/lib/schedule";

describe("US holidays (computed from federal rules)", () => {
  it("covers floating and observed holidays", () => {
    expect(holidayOn("US", "2026-11-26")).toBe("Thanksgiving");
    expect(holidayOn("US", "2026-11-27")).toBe("Day after Thanksgiving");
    expect(holidayOn("US", "2026-07-03")).toBe("Independence Day"); // Jul 4 2026 is a Saturday
    expect(holidayOn("US", "2027-06-18")).toBe("Juneteenth"); // Jun 19 2027 is a Saturday
    expect(holidayOn("US", "2027-12-24")).toBe("Christmas Day"); // Dec 25 2027 is a Saturday
    expect(holidayOn("US", "2028-01-17")).toBe("Martin Luther King Jr. Day");
    expect(holidayOn("US", "2026-10-12")).toBeNull(); // Columbus Day — most companies work
  });
});

describe("India holidays", () => {
  it("covers national days and festival dates", () => {
    expect(holidayOn("INDIA", "2027-01-26")).toBe("Republic Day");
    expect(holidayOn("INDIA", "2026-11-08")).toBe("Diwali");
    expect(holidayOn("INDIA", "2027-10-29")).toBe("Diwali");
    expect(holidayOn("INDIA", "2026-03-04")).toBe("Holi");
    expect(holidayOn("INDIA", "2026-11-26")).toBeNull(); // US Thanksgiving is not an Indian holiday
  });

  it("honours the skip toggle and extra no-send dates", () => {
    expect(holidayOn("INDIA", "2027-01-26", { skip_holidays: false })).toBeNull();
    expect(holidayOn("US", "2026-12-31", { extra_blackout_dates: "2026-12-31, bad, 2026-12-30" })).toBe("No-send date (Settings)");
    expect(parseBlackoutDates("2026-12-31, nope,2026-12-30 2026-12-31")).toEqual(["2026-12-30", "2026-12-31"]);
    expect(upcomingHolidays("INDIA", "2026-12-01", 2).map((h) => h.name)).toEqual(["Christmas Day", "New Year's Day"]);
  });
});

describe("holiday-aware scheduling", () => {
  it("blocks sends on holidays and skips them when counting business days", () => {
    expect(isInSendWindow("US", {}, new Date("2026-11-26T15:00:00Z"))).toBe(false); // Thanksgiving 10:00 ET
    expect(isInSendWindow("US", { skip_holidays: false }, new Date("2026-11-26T15:00:00Z"))).toBe(true);
    // Fri 22 Jan 2027 10:00 IST + 3 business days, Republic Day skipped → Thu 28 Jan
    expect(addBusinessDaysInTz(new Date("2027-01-22T04:30:00Z"), 3, "INDIA").toISOString()).toBe("2027-01-28T04:30:00.000Z");
    // first business morning after Wed 25 Nov (US) skips Thanksgiving + day after → Mon 30 Nov 09:00 ET
    expect(nextBusinessMorning(new Date("2026-11-25T18:00:00Z"), "US").toISOString()).toBe("2026-11-30T14:00:00.000Z");
  });
});

describe("sender warm-up", () => {
  const s = { daily_send_limit: 45, warmup_enabled: true, warmup_started_on: "2026-11-23" };
  const on = (d: string) => effectiveDailyLimit(s, new Date(`${d}T06:00:00Z`), "Asia/Kolkata");
  it("ramps 10 → 20 → 30 → full cap by week", () => {
    expect(on("2026-11-23")).toEqual({ cap: 10, warmupWeek: 1 });
    expect(on("2026-11-29")).toEqual({ cap: 10, warmupWeek: 1 });
    expect(on("2026-11-30")).toEqual({ cap: 20, warmupWeek: 2 });
    expect(on("2026-12-07")).toEqual({ cap: 30, warmupWeek: 3 });
    expect(on("2026-12-14")).toEqual({ cap: 45, warmupWeek: null });
  });
  it("never exceeds the configured cap and switches off cleanly", () => {
    expect(effectiveDailyLimit({ ...s, daily_send_limit: 8 }, new Date("2026-11-30T06:00:00Z"))).toEqual({ cap: 8, warmupWeek: 2 });
    expect(effectiveDailyLimit({ ...s, warmup_enabled: false })).toEqual({ cap: 45, warmupWeek: null });
  });
});
