/**
 * Template rendering — pure & isomorphic (used by the sender, the approval
 * queue and the Template Studio live preview).
 *
 * Pipeline:
 *   template ──mergeVars──▶ merged text (link tokens still present)
 *            ──toPlainText──▶ text/plain part   (direct ?ref= URLs)
 *            ──toHtml───────▶ text/html part    (click-tracked anchors + pixel)
 */
import type { Lead } from "./types";

export const LINK_TOKENS = ["tracked_portfolio_url", "tracked_resume_url"] as const;
export type LinkToken = (typeof LINK_TOKENS)[number];

export interface RenderLink {
  /** href used in the HTML part (click tracker in production, direct URL in previews) */
  href: string;
  /** visible anchor text */
  label: string;
  /** direct destination with ?ref= — used in the text/plain part */
  direct: string;
}
export type RenderLinks = Record<LinkToken, RenderLink>;

type MergeLead = Pick<
  Lead,
  "first_name" | "last_name" | "company_name" | "job_title" | "target_role_opening" | "custom_icebreaker"
>;

const TOKEN_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;
const DEFAULT_ROLE = "Senior Brand Marketing / AI Product Marketing";

export function mergeVars(text: string, lead: MergeLead, opts: { originalSubject?: string | null } = {}): string {
  const ice = lead.custom_icebreaker?.trim();
  const values: Record<string, string> = {
    first_name: lead.first_name?.trim() || "Team",
    last_name: lead.last_name?.trim() || "",
    company_name: lead.company_name?.trim() || "your team",
    job_title: lead.job_title?.trim() || "",
    target_role_opening: lead.target_role_opening?.trim() || DEFAULT_ROLE,
    // Own paragraph when present; collapses to nothing (no stray blank line) when empty.
    custom_icebreaker: ice ? `${ice}\n\n` : "",
    original_subject: opts.originalSubject?.trim() || "",
  };
  return text.replace(TOKEN_RE, (m, key: string) => {
    const k = key.toLowerCase();
    if ((LINK_TOKENS as readonly string[]).includes(k)) return `{{${k}}}`;
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

export function withRef(base: string, leadId: string): string {
  try {
    const u = new URL(base);
    u.searchParams.set("ref", leadId);
    return u.toString();
  } catch {
    return `${base}${base.includes("?") ? "&" : "?"}ref=${encodeURIComponent(leadId)}`;
  }
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
export function previewLinks(leadId: string, portfolioBase: string, resumeBase: string): RenderLinks {
  const p = withRef(portfolioBase, leadId);
  const r = withRef(resumeBase, leadId);
  return {
    tracked_portfolio_url: { href: p, direct: p, label: displayUrl(portfolioBase) },
    tracked_resume_url: { href: r, direct: r, label: displayUrl(resumeBase) },
  };
}

export function toPlainText(merged: string, links: RenderLinks): string {
  return merged
    .replace(TOKEN_RE, (m, key: string) => {
      const k = key.toLowerCase() as LinkToken;
      return links[k]?.direct ?? m;
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

function linkify(escaped: string, links: RenderLinks): string {
  return escaped.replace(TOKEN_RE, (m, key: string) => {
    const l = links[key.toLowerCase() as LinkToken];
    if (!l) return m;
    return `<a href="${esc(l.href)}" style="color:#1a73e8" target="_blank">${esc(l.label)}</a>`;
  });
}

/** Removes tracking pixels / remote images so dashboard previews never fire a false "open". */
export function stripImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, "");
}
