import { describe, expect, it } from "vitest";
import { addBusinessDaysInTz, isInSendWindow, startOfTodayIn } from "@/lib/schedule";

const W = {}; // default windows: IN 10–18 IST, US 9–17 New York, GLOBAL 9–18 UTC

describe("isInSendWindow", () => {
  it("enforces 10:00–18:00 IST on weekdays for India", () => {
    expect(isInSendWindow("INDIA", W, new Date("2026-11-16T04:30:00Z"))).toBe(true); // Mon 10:00 IST
    expect(isInSendWindow("INDIA", W, new Date("2026-11-16T04:29:00Z"))).toBe(false); // Mon 09:59 IST
    expect(isInSendWindow("INDIA", W, new Date("2026-11-16T12:30:00Z"))).toBe(false); // Mon 18:00 IST (end exclusive)
    expect(isInSendWindow("INDIA", W, new Date("2026-11-21T06:00:00Z"))).toBe(false); // Sat
  });

  it("uses New York local time for US leads, across DST", () => {
    expect(isInSendWindow("US", W, new Date("2026-11-16T14:00:00Z"))).toBe(true); // Mon 09:00 EST
    expect(isInSendWindow("US", W, new Date("2026-11-16T13:59:00Z"))).toBe(false); // Mon 08:59 EST
    expect(isInSendWindow("US", W, new Date("2026-07-06T13:00:00Z"))).toBe(true); // Mon 09:00 EDT
  });

  it("judges the weekday in the recipient's zone", () => {
    // Fri 23:30 UTC = Sat 05:00 IST but Fri 18:30 New York
    const t = new Date("2026-11-20T23:30:00Z");
    expect(isInSendWindow("INDIA", W, t)).toBe(false);
    expect(isInSendWindow("US", W, t)).toBe(false); // after 17:00
    expect(isInSendWindow("US", W, new Date("2026-11-20T21:30:00Z"))).toBe(true); // Fri 16:30 EST
  });

  it("honours custom windows", () => {
    expect(isInSendWindow("GLOBAL", { global_window_start: 6, global_window_end: 8 }, new Date("2026-11-16T07:00:00Z"))).toBe(true);
  });
});

describe("addBusinessDaysInTz", () => {
  it("skips the weekend in the recipient's zone and keeps the local time", () => {
    // Thu 11:00 IST + 3 business days = Tue 11:00 IST
    const out = addBusinessDaysInTz(new Date("2026-11-19T05:30:00Z"), 3, "INDIA");
    expect(out.toISOString()).toBe("2026-11-24T05:30:00.000Z");
  });

  it("handles a US DST change", () => {
    // Fri 31 Oct 2026 10:00 EDT + 3 business days = Wed 4 Nov 10:00 EST
    const out = addBusinessDaysInTz(new Date("2026-10-30T14:00:00Z"), 3, "US");
    expect(out.toISOString()).toBe("2026-11-04T15:00:00.000Z");
  });
});

describe("startOfTodayIn", () => {
  it("returns local midnight as an instant", () => {
    expect(startOfTodayIn("Asia/Kolkata", new Date("2026-11-16T20:00:00Z")).toISOString()).toBe("2026-11-16T18:30:00.000Z");
  });
});
