import { addBusinessDays, addDays, startOfDay } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { GEO_TZ } from "./meta";
import type { GeoRegion, SystemSettings } from "./types";

type WindowSettings = Partial<
  Pick<
    SystemSettings,
    | "india_window_start"
    | "india_window_end"
    | "us_window_start"
    | "us_window_end"
    | "global_window_start"
    | "global_window_end"
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

/** Mon–Fri, [start, end) local hours in the recipient's timezone. */
export function isInSendWindow(geo: GeoRegion, s: WindowSettings, now = new Date()): boolean {
  const { tz, start, end } = sendWindow(geo, s);
  const isoDay = Number(formatInTimeZone(now, tz, "i")); // 1 = Mon … 7 = Sun
  if (isoDay > 5) return false;
  const hour = Number(formatInTimeZone(now, tz, "H")) + Number(formatInTimeZone(now, tz, "m")) / 60;
  return hour >= start && hour < end;
}

/** Adds business days (Sat/Sun skipped) as observed in the recipient's timezone. */
export function addBusinessDaysInTz(from: Date, days: number, geo: GeoRegion): Date {
  const tz = GEO_TZ[geo];
  const zoned = toZonedTime(from, tz);
  return fromZonedTime(addBusinessDays(zoned, days), tz);
}

export function addCalendarDays(from: Date, days: number): Date {
  return addDays(from, days);
}

/** Midnight "today" in the given timezone, as an absolute instant. */
export function startOfTodayIn(tz: string, now = new Date()): Date {
  return fromZonedTime(startOfDay(toZonedTime(now, tz)), tz);
}

export function localTimeLabel(geo: GeoRegion, now = new Date()): string {
  return formatInTimeZone(now, GEO_TZ[geo], "EEE HH:mm zzz");
}
