import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { displayUrl, withRef, type RenderLinks } from "../render";
import type { SystemSettings } from "../types";

function sign(parts: string[]): string {
  return createHmac("sha256", env.trackingSecret()).update(parts.join("|")).digest("hex").slice(0, 24);
}

export function verifyClick(leadId: string, logId: string, target: string, sig: string): boolean {
  const expected = Buffer.from(sign([leadId, logId, target]));
  const given = Buffer.from(sig || "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function clickUrl(leadId: string, logId: string, target: string): string {
  const u = new URL(`${env.appBaseUrl()}/api/track/click`);
  u.searchParams.set("l", leadId);
  u.searchParams.set("e", logId);
  u.searchParams.set("u", target);
  u.searchParams.set("s", sign([leadId, logId, target]));
  return u.toString();
}

export function pixelUrl(leadId: string, logId: string): string {
  return `${env.appBaseUrl()}/api/track/open?l=${leadId}&e=${logId}`;
}

/** Production links: HTML anchors go through the click tracker; text part uses direct ?ref= URLs. */
export function trackedLinks(
  leadId: string,
  logId: string,
  settings: Pick<SystemSettings, "portfolio_base_url" | "resume_url">,
): RenderLinks {
  const portfolio = withRef(settings.portfolio_base_url, leadId);
  const resume = withRef(settings.resume_url, leadId);
  return {
    tracked_portfolio_url: {
      href: clickUrl(leadId, logId, portfolio),
      direct: portfolio,
      label: displayUrl(settings.portfolio_base_url),
    },
    tracked_resume_url: {
      href: clickUrl(leadId, logId, resume),
      direct: resume,
      label: displayUrl(settings.resume_url),
    },
  };
}
