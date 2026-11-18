/**
 * Telegram alert and digest formatting — pure, so the exact wording is unit-tested.
 * Messages use Telegram's HTML parse mode (only <b>, <i>, <a>, <code> are used).
 */
import { formatInTimeZone } from "date-fns-tz";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Opens a Gmail thread (or message) in the right account. */
export function gmailUrl(mailbox: string | null | undefined, id: string): string {
  const account = mailbox ? `?authuser=${encodeURIComponent(mailbox)}` : "";
  return `https://mail.google.com/mail/${account}#all/${encodeURIComponent(id)}`;
}

/** Opens the lead's dossier drawer on the pipeline board. */
export function dossierUrl(appBase: string, leadId: string): string {
  return `${appBase.replace(/\/$/, "")}/?lead=${encodeURIComponent(leadId)}`;
}

const SENTIMENT: Record<string, { icon: string; title: string }> = {
  POSITIVE: { icon: "🔥", title: "HOT — positive reply" },
  NEUTRAL: { icon: "💬", title: "New reply" },
  NOT_NOW: { icon: "⏳", title: "Reply — not now" },
  NEGATIVE: { icon: "✋", title: "Reply — not interested" },
  OUT_OF_OFFICE: { icon: "🌴", title: "Auto-reply — out of office" },
};

export interface ReplyAlert {
  sentiment: string;
  late: boolean;
  company: string;
  person: string;
  jobTitle: string | null;
  email: string;
  snippet: string;
  afterTouch: string | null;
  roleTrack: string;
  geo: string;
  gmailLink: string | null;
  dossierLink: string;
}

export function formatReplyAlert(a: ReplyAlert): string {
  const s = SENTIMENT[a.sentiment] ?? SENTIMENT.NEUTRAL;
  const action =
    a.sentiment === "POSITIVE"
      ? "👉 Reply from Gmail soon — they are open to talking."
      : a.sentiment === "OUT_OF_OFFICE"
        ? "Sequence paused. Use Resume in the dossier to continue on the original schedule."
        : a.sentiment === "NOT_NOW"
          ? "Consider moving them to Nurture (re-engage in 60 days)."
          : a.sentiment === "NEGATIVE"
            ? "Mark as Rejected in the dossier when you've read it."
            : "Read it and decide the next step in the dossier.";
  const lines = [
    `${s.icon} <b>${escapeHtml(a.late ? `Late reply (after archive) — ${s.title.toLowerCase()}` : s.title)}</b>`,
    `<b>${escapeHtml(a.company)}</b> · ${escapeHtml(a.person)}${a.jobTitle ? ` (${escapeHtml(a.jobTitle)})` : ""}`,
    `<code>${escapeHtml(a.email)}</code>`,
    "",
    `<i>“${escapeHtml(a.snippet.slice(0, 400))}”</i>`,
    "",
    [a.afterTouch ? `after ${a.afterTouch}` : null, a.roleTrack, a.geo].filter(Boolean).join(" · "),
    "Follow-ups stopped automatically.",
    action,
    "",
    [a.gmailLink ? `<a href="${escapeHtml(a.gmailLink)}">Open in Gmail</a>` : null, `<a href="${escapeHtml(a.dossierLink)}">Open dossier</a>`]
      .filter(Boolean)
      .join("  ·  "),
  ];
  return lines.join("\n");
}

export interface DigestLead {
  company: string;
  person: string;
  sentiment?: string | null;
  link: string;
}
export interface DigestData {
  now: Date;
  tz: string;
  mode: "APPROVAL_GATE" | "AUTO_PILOT";
  triage: DigestLead[];
  triageTotal: number;
  dueToday: number;
  warm: DigestLead[];
  warmTotal: number;
  interviewing: number;
  sentYesterday: number;
  dailyLimit: number;
  approvalsLink: string;
  analyticsLink: string;
}

export function formatDigest(d: DigestData): string {
  const day = formatInTimeZone(d.now, d.tz, "EEE d MMM");
  const lead = (l: DigestLead) =>
    `• ${l.sentiment ? `${SENTIMENT[l.sentiment]?.icon ?? "💬"} ` : ""}<a href="${escapeHtml(l.link)}">${escapeHtml(l.company)}</a> · ${escapeHtml(l.person)}`;
  const lines = [`📋 <b>OutreachOS · ${escapeHtml(day)}</b>`, ""];

  if (d.triageTotal) {
    lines.push(`<b>Replies waiting in triage: ${d.triageTotal}</b>`, ...d.triage.map(lead));
    if (d.triageTotal > d.triage.length) lines.push(`…and ${d.triageTotal - d.triage.length} more`);
  } else lines.push("No replies waiting in triage.");
  lines.push("");

  if (d.mode === "APPROVAL_GATE")
    lines.push(
      d.dueToday ? `<b>${d.dueToday} touch${d.dueToday === 1 ? "" : "es"} waiting for approval</b> — <a href="${escapeHtml(d.approvalsLink)}">approve</a>` : "Nothing waiting for approval.",
    );
  else lines.push(`${d.dueToday} touch${d.dueToday === 1 ? "" : "es"} scheduled today (auto-pilot).`);

  if (d.warmTotal) {
    lines.push("", `<b>Warm leads (engaged, no reply yet): ${d.warmTotal}</b>`, ...d.warm.map(lead));
  }
  lines.push(
    "",
    `Interviews in progress: ${d.interviewing}`,
    `Sent yesterday: ${d.sentYesterday} · daily cap ${d.dailyLimit}`,
    `<a href="${escapeHtml(d.analyticsLink)}">Analytics</a>`,
  );
  return lines.join("\n");
}
