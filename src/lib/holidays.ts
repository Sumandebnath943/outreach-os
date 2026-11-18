/**
 * Public-holiday calendar for send windows and business-day maths. A holiday counts like a
 * weekend: nothing is sent, and it doesn't count as a business day when scheduling follow-ups.
 *
 *  - US: computed from the federal rules (works for any year), with the observed-day shift
 *    for Saturday/Sunday holidays, plus the day after Thanksgiving. Columbus Day and Veterans
 *    Day are omitted: most companies work.
 *  - INDIA: the holidays most companies close for. Fixed dates are computed; festival dates
 *    follow the lunar calendar, so they are listed per year (2026–2027 published dates).
 *    Regional/state holidays can be added as extra no-send dates in Settings.
 *  - GLOBAL: New Year's Day and Christmas.
 */
import type { GeoRegion } from "./types";

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const weekday = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun

/** n-th given weekday of a month (n = -1 → last). */
function nthWeekday(y: number, m: number, dow: number, n: number): string {
  if (n > 0) {
    const first = weekday(y, m, 1);
    return iso(y, m, 1 + ((dow - first + 7) % 7) + (n - 1) * 7);
  }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return iso(y, m, last - ((weekday(y, m, last) - dow + 7) % 7));
}

/** Federal observed date: Saturday → Friday before, Sunday → Monday after. */
function observed(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  if (dow === 6) dt.setUTCDate(d - 1);
  if (dow === 0) dt.setUTCDate(d + 1);
  return dt.toISOString().slice(0, 10);
}

function usHolidays(y: number): Record<string, string> {
  const thanksgiving = nthWeekday(y, 11, 4, 4);
  const dayAfter = new Date(`${thanksgiving}T00:00:00Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  return {
    [observed(y, 1, 1)]: "New Year's Day",
    [nthWeekday(y, 1, 1, 3)]: "Martin Luther King Jr. Day",
    [nthWeekday(y, 2, 1, 3)]: "Presidents' Day",
    [nthWeekday(y, 5, 1, -1)]: "Memorial Day",
    [observed(y, 6, 19)]: "Juneteenth",
    [observed(y, 7, 4)]: "Independence Day",
    [nthWeekday(y, 9, 1, 1)]: "Labor Day",
    [thanksgiving]: "Thanksgiving",
    [dayAfter.toISOString().slice(0, 10)]: "Day after Thanksgiving",
    [observed(y, 12, 25)]: "Christmas Day",
  };
}

/** India festival dates (lunar calendar) — published 2026 and 2027 dates. Extend yearly. */
const INDIA_FESTIVALS: Record<number, Record<string, string>> = {
  2026: {
    "2026-03-04": "Holi",
    "2026-03-21": "Eid ul-Fitr",
    "2026-10-20": "Dussehra",
    "2026-11-08": "Diwali",
  },
  2027: {
    "2027-03-22": "Holi",
    "2027-03-10": "Eid ul-Fitr",
    "2027-10-09": "Dussehra",
    "2027-10-29": "Diwali",
  },
};
/** Last year with India festival dates loaded (shown in Settings so it can be extended in time). */
export const INDIA_FESTIVALS_UNTIL = Math.max(...Object.keys(INDIA_FESTIVALS).map(Number));

function indiaHolidays(y: number): Record<string, string> {
  return {
    [iso(y, 1, 1)]: "New Year's Day",
    [iso(y, 1, 26)]: "Republic Day",
    [iso(y, 8, 15)]: "Independence Day",
    [iso(y, 10, 2)]: "Gandhi Jayanti",
    [iso(y, 12, 25)]: "Christmas Day",
    ...(INDIA_FESTIVALS[y] ?? {}),
  };
}

function globalHolidays(y: number): Record<string, string> {
  return { [iso(y, 1, 1)]: "New Year's Day", [iso(y, 12, 25)]: "Christmas Day" };
}

const cache = new Map<string, Record<string, string>>();
function forYear(geo: GeoRegion, y: number): Record<string, string> {
  const key = `${geo}:${y}`;
  if (!cache.has(key)) cache.set(key, geo === "US" ? usHolidays(y) : geo === "INDIA" ? indiaHolidays(y) : globalHolidays(y));
  return cache.get(key)!;
}

/** Parses the Settings "extra no-send dates" field (YYYY-MM-DD, comma/space separated). */
export function parseBlackoutDates(raw: string | null | undefined): string[] {
  return [...new Set((raw ?? "").split(/[\s,;]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
}

export interface HolidaySettings {
  skip_holidays?: boolean;
  extra_blackout_dates?: string | null;
}

/** Holiday name for a local calendar date (YYYY-MM-DD) in the recipient's region, or null. */
export function holidayOn(geo: GeoRegion, localDate: string, s: HolidaySettings = {}): string | null {
  if (parseBlackoutDates(s.extra_blackout_dates).includes(localDate)) return "No-send date (Settings)";
  if (s.skip_holidays === false) return null;
  return forYear(geo, Number(localDate.slice(0, 4)))[localDate] ?? null;
}

/** Upcoming holidays (for the Settings page). */
export function upcomingHolidays(geo: GeoRegion, fromLocalDate: string, count = 5): { date: string; name: string }[] {
  const y = Number(fromLocalDate.slice(0, 4));
  return [y, y + 1]
    .flatMap((yr) => Object.entries(forYear(geo, yr)).map(([date, name]) => ({ date, name })))
    .filter((h) => h.date >= fromLocalDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, count);
}
