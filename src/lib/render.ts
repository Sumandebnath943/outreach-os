/**
 * Template rendering — pure & isomorphic (used by the sender, the approval
 * queue and the Template Studio live preview).
 *
 * Pipeline:
 *   template ──mergeVars──▶ merged text (link tokens still present)
 *            ──toPlainText──▶ text/plain part   (direct ?ref= URLs)
 *            ──toHtml───────▶ text/html part    (click-tracked anchors + pixel)
 *
 * Link tokens can carry their own anchor text: {{tracked_portfolio_url|Portfolio}} renders as a
 * clickable "Portfolio" in HTML and "Portfolio (https://…)" in the text part.
 */
import type { Lead } from "./types";

export const LINK_TOKENS = ["tracked_portfolio_url", "tracked_resume_url", "tracked_linkedin_url"] as const;
export type LinkToken = (typeof LINK_TOKENS)[number];

export interface RenderLink {
  /** href used in the HTML part (click tracker in production, direct URL in previews) */
  href: string;
  /** default anchor text when the token has no |label */
  label: string;
  /** direct destination with ?ref= — used in the text/plain part */
  direct: string;
}
/** A link may be missing (e.g. no LinkedIn URL configured): its label then renders as plain text. */
export type RenderLinks = Partial<Record<LinkToken, RenderLink>>;

type MergeLead = Pick<
  Lead,
  "first_name" | "last_name" | "company_name" | "job_title" | "target_role_opening" | "custom_icebreaker"
> &
  Partial<Pick<Lead, "role_track">>;

/** {{name}} or {{link_token|Anchor text}} */
const TOKEN_RE = /\{\{\s*([a-z_]+)\s*(?:\|([^{}|]*))?\}\}/gi;
const SIGNATURE_RE = /\{\{\s*signature\s*\}\}/gi;

/** What {{target_role_opening}} says when the lead has no specific opening (read as "… roles"). */
export const DEFAULT_ROLE_BY_TRACK: Record<Lead["role_track"], string> = {
  HYBRID_DEFAULT: "Senior Brand Marketing, AI Product Marketing or AI Product Manager",
  BRAND: "Senior Brand Marketing Manager",
  AI_PMM: "AI Product Marketing Manager",
  AI_PM: "AI Product Manager",
};
const DEFAULT_ROLE = DEFAULT_ROLE_BY_TRACK.HYBRID_DEFAULT;
const isLinkToken = (k: string): k is LinkToken => (LINK_TOKENS as readonly string[]).includes(k);

export function mergeVars(
  text: string,
  lead: MergeLead,
  opts: { originalSubject?: string | null; signature?: string | null } = {},
): string {
  const ice = lead.custom_icebreaker?.trim();
  const values: Record<string, string> = {
    first_name: lead.first_name?.trim() || "Team",
    last_name: lead.last_name?.trim() || "",
    company_name: lead.company_name?.trim() || "your team",
    job_title: lead.job_title?.trim() || "",
    target_role_opening: lead.target_role_opening?.trim() || (lead.role_track ? DEFAULT_ROLE_BY_TRACK[lead.role_track] : DEFAULT_ROLE),
    // Own paragraph when present; collapses to nothing (no stray blank line) when empty.
    custom_icebreaker: ice ? `${ice}\n\n` : "",
    original_subject: opts.originalSubject?.trim() || "",
  };
  // The shared signature (Settings) is expanded first, so its own link tokens are kept below.
  const withSignature = text.replace(SIGNATURE_RE, (opts.signature ?? "").replace(/\r\n/g, "\n").trim());
  return withSignature.replace(TOKEN_RE, (m, key: string, label?: string) => {
    const k = key.toLowerCase();
    if (isLinkToken(k)) return label?.trim() ? `{{${k}|${label.trim()}}}` : `{{${k}}}`;
    return k in values ? values[k] : m;
  });
}

/** Tokens that are neither known merge variables nor link tokens. */
export function findUnresolved(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TOKEN_RE)) {
    const k = m[1].toLowerCase();
    if (!(LINK_TOKENS as readonly string[]).includes(k)) out.add(m[0]);
  }
  return [...out];
}

export function withRef(base: string, leadId: string, utm?: Utm): string {
  try {
    const u = new URL(base);
    u.searchParams.set("ref", leadId);
    if (utm) for (const [k, v] of Object.entries(utm)) if (v) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return `${base}${base.includes("?") ? "&" : "?"}ref=${encodeURIComponent(leadId)}`;
  }
}

// ── UTM tagging ──────────────────────────────────────────────────────────────
// Every portfolio/résumé link carries who it was sent to and where they were in
// the funnel, so the portfolio's own visitor beacon (e.g. Telegram alerts) can
// read it straight from the landing URL:
//   utm_source=outreachos  utm_medium=email
//   utm_campaign=<company>  utm_term=<person>  utm_content=<funnel stage>-<touch>
// utm_content is written with the stage at send time and re-stamped with the
// lead's stage at the moment of the click by the click redirect.

export interface Utm {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
}

/** "Acme AI, Inc." → "acme-ai-inc"; accents folded, at most 60 chars. */
export function utmSlug(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** "WARM_ENGAGED" + "T2A" → "warm_engaged-t2a" */
export function utmContent(stage: string, touchCode: string): string {
  return `${stage.toLowerCase()}-${touchCode.toLowerCase()}`;
}

/** Replaces the stage part of utm_content, keeping the touch suffix ("…-t2a"). */
export function restampStage(utmContentValue: string, stage: string): string {
  const touch = utmContentValue.split("-").pop() ?? "";
  return /^t\d[ab]?$/.test(touch) ? utmContent(stage, touch) : utmContentValue;
}

export function buildUtm(
  lead: Pick<Lead, "company_name" | "first_name" | "last_name">,
  stage: string,
  touchCode: string,
): Utm {
  const person = [lead.first_name === "Team" ? "" : lead.first_name, lead.last_name ?? ""].join(" ");
  return {
    utm_source: "outreachos",
    utm_medium: "email",
    utm_campaign: utmSlug(lead.company_name) || "unknown-company",
    utm_term: utmSlug(person) || "team",
    utm_content: utmContent(stage, touchCode),
  };
}

/** "https://sumandebnath.houseofnamus.com/resume" → "sumandebnath.houseofnamus.com/resume" */
export function displayUrl(base: string): string {
  try {
    const u = new URL(base);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${u.host}${path}`;
  } catch {
    return base.replace(/^https?:\/\//, "");
  }
}

/** Links for previews (no click tracking, direct ?ref= destinations). */
export function previewLinks(leadId: string, portfolioBase: string, resumeBase: string, linkedinUrl?: string | null): RenderLinks {
  const p = withRef(portfolioBase, leadId);
  const r = withRef(resumeBase, leadId);
  return {
    tracked_portfolio_url: { href: p, direct: p, label: displayUrl(portfolioBase) },
    tracked_resume_url: { href: r, direct: r, label: displayUrl(resumeBase) },
    ...(linkedinUrl ? { tracked_linkedin_url: { href: linkedinUrl, direct: linkedinUrl, label: "LinkedIn" } } : {}),
  };
}

export function toPlainText(merged: string, links: RenderLinks): string {
  return merged
    .replace(TOKEN_RE, (m, key: string, label?: string) => {
      const k = key.toLowerCase();
      if (!isLinkToken(k)) return m;
      const l = links[k];
      const text = label?.trim();
      if (!l) return text ?? ""; // link not configured: keep its words, drop the token
      return text ? `${text} (${l.direct})` : l.direct;
    })
    .replace(/\r\n/g, "\n")
    .trim();
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const BULLET_RE = /^\s*(?:[-•*])\s+/;

export function toHtml(merged: string, links: RenderLinks, pixelUrl?: string): string {
  const blocks = merged.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  const html: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    let para: string[] = [];
    let list: string[] = [];
    const flushPara = () => {
      if (para.length) html.push(`<p style="margin:0 0 14px">${para.join("<br>")}</p>`);
      para = [];
    };
    const flushList = () => {
      if (list.length)
        html.push(
          `<ul style="margin:0 0 14px;padding-left:22px">${list
            .map((li) => `<li style="margin:0 0 6px">${li}</li>`)
            .join("")}</ul>`,
        );
      list = [];
    };
    for (const raw of lines) {
      const line = linkify(esc(raw.replace(BULLET_RE, "")), links);
      if (BULLET_RE.test(raw)) {
        flushPara();
        list.push(line);
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara();
    flushList();
  }

  const pixel = pixelUrl
    ? `<img src="${esc(pixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0" />`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#202124">${html.join(
    "",
  )}</div>${pixel}`;
}

/** `escaped` is already HTML-escaped, so a token's |label is too. */
function linkify(escaped: string, links: RenderLinks): string {
  return escaped.replace(TOKEN_RE, (m, key: string, label?: string) => {
    const k = key.toLowerCase();
    if (!isLinkToken(k)) return m;
    const l = links[k];
    const text = label?.trim() || (l ? esc(l.label) : "");
    if (!l) return text;
    return `<a href="${esc(l.href)}" style="color:#1a73e8" target="_blank">${text}</a>`;
  });
}

/** Removes tracking pixels / remote images so dashboard previews never fire a false "open". */
export function stripImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, "");
}
