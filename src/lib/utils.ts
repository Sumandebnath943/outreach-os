import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const future = diff < 0;
  const s = Math.abs(diff) / 1000;
  const fmt = (v: number, u: string) => (future ? `in ${Math.round(v)}${u}` : `${Math.round(v)}${u} ago`);
  if (s < 60) return future ? "in <1m" : "just now";
  if (s < 3600) return fmt(s / 60, "m");
  if (s < 86400) return fmt(s / 3600, "h");
  return fmt(s / 86400, "d");
}

export function fullName(l: { first_name: string; last_name: string | null }) {
  return [l.first_name, l.last_name].filter(Boolean).join(" ");
}
