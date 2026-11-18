import { addDays, format, startOfDay } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { holidayOn, type HolidaySettings } from "./holidays";
import { GEO_TZ } from "./meta";
import type { GeoRegion, SystemSettings } from "./types";

export type WindowSettings = Partial<
  Pick<
    SystemSettings,
    | "india_window_start"
    | "india_window_end"
    | "us_window_start"
    | "us_window_end"
    | "global_window_start"
    | "global_window_end"
    | "skip_holidays"
    | "extra_blackout_dates"
  >
>;

export function sendWindow(geo: GeoRegion, s: WindowSettings) {
  switch (geo) {
    case "INDIA":
      return { tz: GEO_TZ.INDIA, start: s.india_window_start ?? 10, end: s.india_window_end ?? 18 };
    case "US":
      return { tz: GEO_TZ.US, start: s.us_window_start ?? 9, end: s.us_window_end ?? 17 };
    default:
      return { tz: GEO_TZ.GLOBAL, start: s.global_window_start ?? 9, end: s.global_window_end ?? 18 };
  }
}

/** Holiday name if `now` falls on a public holiday / no-send date in the recipient's region. */
export function holidayAt(geo: GeoRegion, s: HolidaySettings, now = new Date()): string | null {
  return holidayOn(geo, formatInTimeZone(now, GEO_TZ[geo], "yyyy-MM-dd"), s);
}

/** Mon–Fri, not a public holiday, [start, end) local hours in the recipient's timezone. */
export function isInSendWindow(geo: GeoRegion, s: WindowSettings, now = new Date()): boolean {
  const { tz, start, end } = sendWindow(geo, s);
  const isoDay = Number(formatInTimeZone(now, tz, "i")); // 1 = Mon … 7 = Sun
  if (isoDay > 5) return false;
  if (holidayAt(geo, s, now)) return false;
  const hour = Number(formatInTimeZone(now, tz, "H")) + Number(formatInTimeZone(now, tz, "m")) / 60;
  return hour >= start && hour < end;
}

/**
 * Adds business days in the recipient's timezone, keeping the local time of day. Weekends and
 * public holidays (plus extra no-send dates) are skipped, so "+3 business days" never lands on,
 * or counts, a holiday.
 */
export function addBusinessDaysInTz(from: Date, days: number, geo: GeoRegion, s: HolidaySettings = {}): Date {
  const tz = GEO_TZ[geo];
  let local = toZonedTime(from, tz);
  let left = days;
  while (left > 0) {
    local = addDays(local, 1);
    const dow = local.getDay();
    if (dow === 0 || dow === 6) continue;
    if (holidayOn(geo, format(local, "yyyy-MM-dd"), s)) continue;
    left--;
  }
  return fromZonedTime(local, tz);
}

export function addCalendarDays(from: Date, days: number): Date {
  return addDays(from, days);
}

/** Midnight "today" in the given timezone, as an absolute instant. */
export function startOfTodayIn(tz: string, now = new Date()): Date {
  return fromZonedTime(startOfDay(toZonedTime(now, tz)), tz);
}

/** The recipient-local window start (e.g. 10:00 IST) on the first business day after `date`. */
export function nextBusinessMorning(date: Date, geo: GeoRegion, s: WindowSettings & HolidaySettings = {}): Date {
  const { tz, start } = sendWindow(geo, s);
  const next = addBusinessDaysInTz(date, 1, geo, s);
  const local = toZonedTime(next, tz);
  local.setHours(start, 0, 0, 0);
  return fromZonedTime(local, tz);
}

export function localTimeLabel(geo: GeoRegion, now = new Date()): string {
  return formatInTimeZone(now, GEO_TZ[geo], "EEE HH:mm zzz");
}
