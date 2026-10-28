import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { addDays } from 'date-fns';
import { GeoRegion } from '@/types/outreach';

interface WindowConfig {
  timezone: string;
  startHour: number;
  endHour: number;
}

export const GEO_WINDOWS: Record<GeoRegion, WindowConfig> = {
  INDIA: {
    timezone: 'Asia/Kolkata',
    startHour: 10, // 10:00 AM IST
    endHour: 18,   // 6:00 PM IST
  },
  US: {
    timezone: 'America/New_York',
    startHour: 9,  // 9:00 AM EST/EDT
    endHour: 17,   // 5:00 PM EST/EDT
  },
  GLOBAL: {
    timezone: 'UTC',
    startHour: 9,  // 9:00 AM UTC
    endHour: 18,   // 6:00 PM UTC
  },
};

/**
 * Checks whether a given timestamp is within the allowed Mon-Fri business hours
 * for the recipient's GeoRegion.
 */
export function isWithinSendingWindow(geoRegion: GeoRegion, now: Date = new Date()): {
  allowed: boolean;
  reason: string;
  localTimeStr: string;
  timezone: string;
} {
  const cfg = GEO_WINDOWS[geoRegion] || GEO_WINDOWS.INDIA;
  const zoned = toZonedTime(now, cfg.timezone);
  const dayOfWeek = zoned.getDay(); // 0 = Sun, 6 = Sat
  const hour = zoned.getHours();
  const localTimeStr = formatInTimeZone(now, cfg.timezone, 'EEE HH:mm zzz');

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      allowed: false,
      reason: `Weekend in ${cfg.timezone} (${localTimeStr})`,
      localTimeStr,
      timezone: cfg.timezone,
    };
  }

  if (hour < cfg.startHour || hour >= cfg.endHour) {
    return {
      allowed: false,
      reason: `Outside ${cfg.startHour}:00–${cfg.endHour}:00 window (${localTimeStr})`,
      localTimeStr,
      timezone: cfg.timezone,
    };
  }

  return {
    allowed: true,
    reason: `Active window (${localTimeStr})`,
    localTimeStr,
    timezone: cfg.timezone,
  };
}

/**
 * Adds N business days (excluding Saturday & Sunday) to a base date,
 * normalized to the recipient's timezone.
 */
export function addBusinessDaysForGeo(
  baseDate: Date,
  businessDays: number,
  geoRegion: GeoRegion
): Date {
  if (businessDays <= 0) {
    return baseDate;
  }

  const cfg = GEO_WINDOWS[geoRegion] || GEO_WINDOWS.INDIA;
  let zonedCursor = toZonedTime(baseDate, cfg.timezone);
  let remaining = businessDays;

  while (remaining > 0) {
    zonedCursor = addDays(zonedCursor, 1);
    const day = zonedCursor.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  // Ensure the due time lands cleanly inside the business window (e.g. 10:15 AM local time)
  const hour = zonedCursor.getHours();
  if (hour < cfg.startHour) {
    zonedCursor.setHours(cfg.startHour, 15, 0, 0);
  } else if (hour >= cfg.endHour) {
    zonedCursor.setHours(cfg.startHour, 30, 0, 0);
  }

  return fromZonedTime(zonedCursor, cfg.timezone);
}

/**
 * Calculates how many business days have elapsed since `sinceDate`.
 */
export function getElapsedBusinessDays(sinceDate: Date, now: Date = new Date()): number {
  if (now <= sinceDate) return 0;
  let cursor = new Date(sinceDate);
  let count = 0;

  while (cursor < now) {
    cursor = addDays(cursor, 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6 && cursor <= now) {
      count += 1;
    }
  }
  return count;
}

/**
 * Generates a randomized human jitter delay in milliseconds between minMinutes and maxMinutes.
 */
export function computeJitterMs(minMinutes: number = 3, maxMinutes: number = 6): number {
  const safeMin = Math.max(0, minMinutes);
  const safeMax = Math.max(safeMin, maxMinutes);
  const minMs = safeMin * 60 * 1000;
  const maxMs = safeMax * 60 * 1000;
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}
