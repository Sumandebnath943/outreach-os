"use client";

import Link from "next/link";
import { Pagination } from "../LeadFilters";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Calendar,
  ExternalLink,
  Eye,
  Globe,
  Link2,
  Mail,
  MessageSquareReply,
  MousePointerClick,
  Pause,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { api, broadcastRefresh, usePoll } from "@/lib/client";
import { GEO_LABEL, GEO_TZ, STAGE_META, touchLabel } from "@/lib/meta";
import { localTimeLabel } from "@/lib/schedule";
import {
  CLOSED_SUB_STAGES,
  FUNNEL_STAGES,
  GEO_REGIONS,
  INTERVIEW_SUB_STAGES,
  ROLE_TRACKS,
  type EmailLog,
  type FunnelStage,
  type Lead,
  type TrackingEvent,
} from "@/lib/types";
import { gmailUrl } from "@/lib/notify";
import { cn, fullName, relTime } from "@/lib/utils";
import { Badge, Button, Input, Label, Select, Textarea, toast } from "../ui";

interface Dossier {
  latestReply: TrackingEvent | null;
  deliveryFailure: string | null;
  eventsTotal: number;
  emailsTotal: number;
  lead: Lead;
  emails: EmailLog[];
  events: TrackingEvent[];
  mailbox: string | null;
}

function GmailLink({ mailbox, id, label }: { mailbox: string | null; id: string; label: string }) {
  return (
    <a
      href={gmailUrl(mailbox, id)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-card px-2.5 text-xs font-medium text-fg hover:border-line-strong hover:bg-raised"
    >
      <Mail className="h-3 w-3" /> {label}
    </a>
  );
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const BOT_REASON: Record<string, string> = {
  before_send_recorded: "fired during send",
  missing_user_agent: "no user agent",
  scanner_user_agent: "security scanner",
  within_grace_period: "within 60s of delivery",
};

function describe(ev: TrackingEvent, logs: EmailLog[]): { icon: React.ReactNode; text: React.ReactNode; tone: string } {
  const m = ev.metadata as Record<string, string | number | boolean | null | undefined>;
  const log = logs.find((l) => l.id === ev.email_log_id);
  const t = log ? ` (${touchLabel(log.touch_number, log.branch_variant)})` : "";
  const bot = m.bot ? (
    <span className="text-dim"> · ignored, likely automated ({BOT_REASON[String(m.botReason)] ?? String(m.botReason)})</span>
  ) : null;
  switch (ev.event_type) {
    case "EMAIL_OPEN":
      return {
        icon: <Eye className="h-3 w-3" />,
        text: (
          <>
            Opened email{t}
            {bot}
          </>
        ),
        tone: bot ? "text-dim" : "text-fg",
      };
    case "LINK_CLICK":
      return {
        icon: <MousePointerClick className="h-3 w-3" />,
        text: (
          <>
            Clicked <span className="font-mono text-warning">{String(m.path ?? m.url ?? "link")}</span>
            {t}
            {bot}
          </>
        ),
        tone: bot ? "text-dim" : "text-warning",
      };
    case "PORTFOLIO_VIEW":
      return {
        icon: <Globe className="h-3 w-3" />,
        text: (
          <>
            Viewed <span className="font-mono text-warning">{String(m.path ?? "/")}</span>
            {m.durationSec ? <> for {Number(m.durationSec)}s</> : null}
          </>
        ),
        tone: "text-warning",
      };
    case "REPLY_RECEIVED":
      return {
        icon: <MessageSquareReply className="h-3 w-3" />,
        text: (
          <>
            Replied <Badge tone="emerald">{String(m.sentiment ?? "")}</Badge>
            <div className="mt-1 text-muted italic">“{String(m.snippet ?? "")}”</div>
          </>
        ),
        tone: "text-success",
      };
    default:
      return {
        icon: <ArrowRight className="h-3 w-3" />,
        text: (
          <>
            {m.from ? STAGE_META[m.from as FunnelStage]?.label ?? String(m.from) : "Created"} →{" "}
            {STAGE_META[m.to as FunnelStage]?.label ?? String(m.to)}
            {m.sub_stage ? ` · ${m.sub_stage}` : ""}
            <span className="text-dim"> · {String(m.reason ?? "")}</span>
          </>
        ),
        tone: "text-muted",
      };
  }
}

export function LeadDrawer({ leadId, onClose, embedded = false }: { leadId: string; onClose: () => void; embedded?: boolean }) {
  const [eventsPage, setEventsPage] = useState(1);
  const [emailsPage, setEmailsPage] = useState(1);
  const { data, reload, error } = usePoll<Dossier>(`/api/leads/${leadId}?eventsPage=${eventsPage}&emailsPage=${emailsPage}`, 15000);
  const [tab, setTab] = useState<"thread" | "timeline" | "details">("timeline");
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setFormState] = useState<Partial<Lead>>({});
  const [dirty, setDirty] = useState(false);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const setForm = (next: Partial<Lead>) => {
    setFormState(next);
    setDirty(true);
  };

  // Background polls (every open/click bumps updated_at) must never wipe unsaved edits.
  useEffect(() => {
    if (data?.lead && !dirty) setFormState(data.lead);
  }, [data?.lead, dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function patch(body: Record<string, unknown>, label: string, savesForm = false) {
    setBusy(label);
    try {
      await api("/api/leads", { method: "PATCH", json: { id: leadId, ...body } });
      toast(label);
      if (savesForm) setDirty(false);
      await reload();
      broadcastRefresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!data || !confirm(`Move ${data.lead.email} to Trash? Sending stops immediately; restore it within 30 days.`)) return;
    try {
      await api(`/api/leads?id=${leadId}`, { method: "DELETE" });
      toast("Lead moved to Trash");
      broadcastRefresh();
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  const lead = data?.lead;
  const events = data?.events ?? [];
  // the latest reply's own thread (a reply may arrive as a brand-new email, outside the outreach thread)
  const lastReply = data?.latestReply ?? events.find((e) => e.event_type === "REPLY_RECEIVED");
  const replyLinkId =
    (lastReply?.metadata.gmailThreadId as string | undefined) ?? (lastReply?.metadata.gmailMessageId as string | undefined) ?? lead?.gmail_thread_id ?? null;
  const emails = data?.emails ?? [];
  const subOptions =
    lead?.funnel_stage === "INTERVIEWING"
      ? INTERVIEW_SUB_STAGES
      : lead?.funnel_stage === "CLOSED_ARCHIVE"
        ? CLOSED_SUB_STAGES
        : null;

  return (
    <div className={embedded ? "mx-auto max-w-5xl px-3 py-5" : "fixed inset-0 z-50 flex justify-end bg-black/50"} onMouseDown={embedded ? undefined : onClose}>
      <aside
        className={embedded ? "flex w-full flex-col rounded-lg border border-line bg-bg" : "animate-slide-in flex h-full w-full max-w-[640px] flex-col border-l border-line bg-bg shadow-2xl"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {!lead ? (
          <div className="p-6 text-sm text-dim">{error ?? "Loading dossier…"}</div>
        ) : (
          <>
            {lead.deleted_at && <div className="border-b border-line bg-amber-500/10 p-4 text-sm text-warning">In Trash. Sending is stopped. <Link className="underline" href="/leads">Restore from Leads → Trash</Link></div>}
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-2"><Link className="mr-auto text-sm text-info" href={embedded ? "/leads" : `/leads/${leadId}`}>{embedded ? "← All leads" : "Open full details ↗"}</Link><Button variant="danger" size="sm" disabled={!!lead.deleted_at} onClick={remove}>Move to Trash</Button></div>
            {/* header */}
            <div className="border-b border-line px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest text-dim uppercase">
                    <span className={cn("h-1.5 w-1.5 rounded-full", STAGE_META[lead.funnel_stage].dot)} />
                    {STAGE_META[lead.funnel_stage].n} · {STAGE_META[lead.funnel_stage].label}
                  </div>
                  <h2 className="mt-1 truncate text-lg font-semibold tracking-tight">{lead.company_name}</h2>
                  <div className="text-sm text-muted">
                    {fullName(lead)}
                    {lead.job_title && <span className="text-dim"> · {lead.job_title}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-dim">
                    <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-fg">
                      <Mail className="h-3 w-3" />
                      {lead.email}
                    </a>
                    {lead.linkedin_url && (
                      <a href={lead.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-fg">
                        <Link2 className="h-3 w-3" /> LinkedIn
                      </a>
                    )}
                    {lead.company_website && (
                      <a href={lead.company_website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-fg">
                        <ExternalLink className="h-3 w-3" /> Website
                      </a>
                    )}
                    <span className="font-mono">
                      {GEO_LABEL[lead.geo_region]} · {localTimeLabel(lead.geo_region)}
                    </span>
                    {lead.gmail_thread_id && <GmailLink mailbox={data?.mailbox ?? null} id={lead.gmail_thread_id} label="Open thread in Gmail" />}
                  </div>
                </div>
                <button onClick={onClose} className="text-dim hover:text-fg" aria-label="Close dossier">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* telemetry strip */}
              <div className="mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-md border border-line bg-line font-mono">
                {[
                  ["OPENS", lead.open_count, lead.open_count >= 2],
                  ["CLICKS", lead.click_count, lead.click_count > 0],
                  ["PAGE VIEWS", lead.portfolio_visit_count, lead.portfolio_visit_count > 0],
                  ["TOUCH", `${lead.current_touch}/4`, false],
                ].map(([k, v, hot]) => (
                  <div key={String(k)} className="bg-card px-3 py-2">
                    <div className="text-[9px] tracking-widest text-dim">{k}</div>
                    <div className={cn("text-base tabular", hot ? "text-warning" : "text-fg")}>{v}</div>
                  </div>
                ))}
              </div>
              {!!lead.portfolio_pages_viewed?.length && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {lead.portfolio_pages_viewed.map((p) => (
                    <Badge key={p} tone="amber">
                      {p}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* stage + sequence control */}
              <section className={cn("grid grid-cols-2 gap-4 border-b border-line px-6 py-4", lead.deleted_at && "pointer-events-none opacity-50")}>
                <div>
                  <Label>Funnel stage</Label>
                  <Select
                    value={lead.funnel_stage}
                    disabled={!!busy}
                    onChange={(e) => patch({ funnel_stage: e.target.value }, `Moved to ${STAGE_META[e.target.value as FunnelStage].label}`)}
                  >
                    {FUNNEL_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_META[s].n} · {STAGE_META[s].label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Sub-stage</Label>
                  {subOptions ? (
                    <Select value={lead.sub_stage ?? ""} onChange={(e) => patch({ sub_stage: e.target.value }, "Sub-stage updated")}>
                      <option value="">—</option>
                      {subOptions.map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      defaultValue={lead.sub_stage ?? ""}
                      key={lead.sub_stage ?? ""}
                      placeholder="—"
                      onBlur={(e) => e.target.value !== (lead.sub_stage ?? "") && patch({ sub_stage: e.target.value }, "Sub-stage updated")}
                    />
                  )}
                </div>

                <div className="col-span-2 rounded-md border border-line bg-card p-3 text-xs">
                  <div className="flex items-center justify-between gap-2"><strong>Email precheck · {lead.email_check_status || 'PENDING'}</strong><Link href="/prechecks" className="underline">Manage checks</Link></div>
                  <p className="mt-1 text-muted">{lead.email_check_reason || 'Awaiting free built-in checks before sending.'}</p>
                  {lead.email_check_warnings?.map(w => <p className="mt-1 text-muted" key={w}>{w}</p>)}
                  <p className="mt-1 text-dim">Mailbox existence is unverified. Last check {relTime(lead.email_checked_at)}.</p>
                  {lead.current_touch === 0 && <div className="mt-3"><Label>Correct email address</Label><Input key={lead.email} aria-label="Correct email address" type="email" defaultValue={lead.email} onBlur={e => { if (e.target.value.trim().toLowerCase() !== lead.email) patch({ email: e.target.value }, 'Email updated; precheck reset'); }} /></div>}
                </div>
                <div className="col-span-2 rounded-md border border-line bg-card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-1.5 w-1.5 rounded-full", lead.sequence_active ? "bg-emerald-400" : "bg-zinc-600")} />
                        <span className="font-medium">{lead.sequence_active ? "Sequence active" : "Sequence stopped"}</span>
                        <Badge tone={lead.approval_status === "APPROVED" ? "emerald" : lead.approval_status === "PAUSED" ? "rose" : "neutral"}>
                          {lead.approval_status}
                        </Badge>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-dim">
                        {lead.sequence_active && lead.next_touch_due_at ? (
                          <>
                            <Calendar className="mr-1 inline h-3 w-3" />
                            {lead.current_touch >= 4 ? "auto-archive" : `T${lead.current_touch + 1}`} due {fmt(lead.next_touch_due_at)} (
                            {relTime(lead.next_touch_due_at)}) · window {GEO_TZ[lead.geo_region]}
                          </>
                        ) : lead.reengage_at ? (
                          <>re-engage {fmt(lead.reengage_at)}</>
                        ) : (
                          "no automated touches scheduled"
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {lead.sequence_active && lead.approval_status !== "PAUSED" && (
                        <Button size="sm" onClick={() => patch({ approval_status: "PAUSED" }, "Sequence paused")} loading={busy === "Sequence paused"}>
                          <Pause className="h-3 w-3" /> Pause
                        </Button>
                      )}
                      {lead.sequence_active && lead.approval_status === "PAUSED" && (
                        <Button size="sm" onClick={() => patch({ approval_status: "PENDING" }, "Sequence unpaused")}>
                          <Play className="h-3 w-3" /> Unpause
                        </Button>
                      )}
                      {!lead.sequence_active && lead.current_touch < 4 && (
                        <Button size="sm" variant="success" onClick={() => patch({ action: "resume_sequence" }, "Sequence resumed")}>
                          <Play className="h-3 w-3" /> Resume sequence
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {lead.reply_snippet && (
                  <div className="col-span-2 rounded-md border border-emerald-500/25 bg-emerald-500/5 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-medium text-success">
                        <MessageSquareReply className="h-3.5 w-3.5" /> Reply {relTime(lead.replied_at)}
                        {lead.reply_sentiment && <Badge tone="emerald">{lead.reply_sentiment}</Badge>}
                      </div>
                    </div>
                    {typeof lastReply?.metadata.summary === "string" && lastReply.metadata.analysedBy === "ai" && (
                      <p className="mt-2 text-xs text-success">
                        🧠 {String(lastReply.metadata.intent ?? "").replace(/_/g, " ").toLowerCase()} — {lastReply.metadata.summary}
                      </p>
                    )}
                    <p className="mt-2 text-sm leading-relaxed text-fg/90">“{lead.reply_snippet}”</p>
                    {typeof lastReply?.metadata.suggestedReply === "string" && (
                      <details className="mt-2 text-xs text-muted">
                        <summary className="cursor-pointer hover:text-fg">✍️ AI draft reply (not sent)</summary>
                        <pre className="mt-1 rounded border border-line bg-bg p-2 font-sans text-[12px] leading-relaxed whitespace-pre-wrap">
                          {lastReply.metadata.suggestedReply}
                        </pre>
                        <button
                          className="mt-1 text-[11px] underline hover:text-fg"
                          onClick={() => navigator.clipboard.writeText(String(lastReply.metadata.suggestedReply)).then(() => toast("Draft copied"))}
                        >
                          Copy draft
                        </button>
                      </details>
                    )}
                    {typeof lastReply?.metadata.autoResumeAt === "string" && lead.sequence_active && (
                      <p className="mt-2 text-xs text-warning">🌴 Out of office — sequence resumes automatically {fmt(lastReply.metadata.autoResumeAt)}.</p>
                    )}
                    {replyLinkId && (
                      <div className="mt-2">
                        <GmailLink mailbox={data?.mailbox ?? null} id={replyLinkId} label="Open reply in Gmail" />
                      </div>
                    )}
                    {lead.funnel_stage === "REPLIED_TRIAGE" && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Button size="sm" variant="success" onClick={() => patch({ funnel_stage: "INTERVIEWING", sub_stage: "HR_SCREEN" }, "Promoted to Interviewing")}>
                          Call booked → Interviewing
                        </Button>
                        <Button size="sm" onClick={() => patch({ funnel_stage: "NURTURE_LATER" }, "Moved to Nurture")}>
                          Not now → Nurture
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => patch({ funnel_stage: "CLOSED_ARCHIVE", sub_stage: "REJECTED" }, "Closed as rejected")}>
                          Rejected
                        </Button>
                        {lead.current_touch < 4 && (
                          <Button size="sm" variant="ghost" onClick={() => patch({ action: "resume_sequence" }, "Sequence resumed")}>
                            Auto-reply? Resume
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {data?.deliveryFailure && <div className="mx-6 my-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-danger"><strong>Delivery problem</strong><p className="mt-1 whitespace-pre-wrap">{diagnosis ?? data?.deliveryFailure}</p>{lead.sub_stage === "BOUNCED" && <Button size="sm" className="mt-2" loading={diagnosing} onClick={async () => { setDiagnosing(true); try { const result = await api<{ reason: string }>(`/api/leads/${leadId}/delivery`); setDiagnosis(result.reason); } catch (e) { toast((e as Error).message, "err"); } finally { setDiagnosing(false); } }}>Read full delivery notice</Button>}</div>}
              {/* tabs */}
              <div className="sticky top-0 z-10 flex gap-1 border-b border-line bg-bg px-6 pt-2">
                {(
                  [
                    ["timeline", `Telemetry · ${data?.eventsTotal ?? events.length}`],
                    ["thread", `Thread · ${emails.filter((e) => e.status !== "QUEUED_FOR_APPROVAL").length}`],
                    ["details", "Details & Notes"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={cn(
                      "-mb-px border-b px-3 py-2 text-xs transition-colors",
                      tab === k ? "border-fg text-fg" : "border-transparent text-dim hover:text-fg",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="px-6 py-4">
                {tab !== "details" && <Pagination fixedSize page={tab === "timeline" ? eventsPage : emailsPage} pageSize={25} total={tab === "timeline" ? data?.eventsTotal ?? 0 : data?.emailsTotal ?? 0} onPage={tab === "timeline" ? setEventsPage : setEmailsPage} onSize={() => {}} />}
                {tab === "timeline" && (
                  <ol className="relative space-y-3 border-l border-line pl-4">
                    {events.length === 0 && <li className="text-sm text-dim">No telemetry yet.</li>}
                    {events.map((ev) => {
                      const d = describe(ev, emails);
                      return (
                        <li key={ev.id} className="relative">
                          <span className={cn("absolute top-1 -left-[23px] flex h-3.5 w-3.5 items-center justify-center rounded-full border border-line bg-card", d.tone)}>
                            {d.icon}
                          </span>
                          <div className={cn("text-[13px]", d.tone)}>{d.text}</div>
                          <div className="font-mono text-[10px] text-dim">
                            {fmt(ev.created_at)} · {relTime(ev.created_at)}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {tab === "thread" && (
                  <div className="space-y-3">
                    {emails.length === 0 && <div className="text-sm text-dim">Nothing sent yet.</div>}
                    {emails.map((m) => (
                      <article key={m.id} className="rounded-md border border-line bg-card">
                        <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium">{m.subject}</div>
                            <div className="font-mono text-[10px] text-dim">
                              {touchLabel(m.touch_number, m.branch_variant)} · {m.provider} · {fmt(m.sent_at)}
                            </div>
                          </div>
                          <Badge
                            tone={m.status === "SENT" ? "emerald" : m.status === "QUEUED_FOR_APPROVAL" ? "amber" : "rose"}
                          >
                            {m.status === "QUEUED_FOR_APPROVAL" ? "DRAFT" : m.status}
                          </Badge>
                        </header>
                        {m.error && <div className="border-b border-line px-3 py-2 font-mono text-[11px] text-danger">{m.error}</div>}
                        {m.status === "QUEUED_FOR_APPROVAL" ? (
                          <pre className="px-3 py-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-muted">{m.body_html}</pre>
                        ) : m.body_html ? (
                          <div className="email-body px-3 py-3 text-[13px] leading-relaxed text-muted" dangerouslySetInnerHTML={{ __html: m.body_html }} />
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}

                {tab === "details" && (
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        ["first_name", "First name"],
                        ["last_name", "Last name"],
                        ["company_name", "Company"],
                        ["job_title", "Their title"],
                        ["target_role_opening", "Target role opening"],
                        ["linkedin_url", "LinkedIn URL"],
                        ["company_website", "Company website"],
                      ] as const
                    ).map(([k, label]) => (
                      <div key={k} className={k === "target_role_opening" ? "col-span-2" : ""}>
                        <Label>{label}</Label>
                        <Input value={(form[k] as string) ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                      </div>
                    ))}
                    <div>
                      <Label>Geo region</Label>
                      <Select value={form.geo_region} onChange={(e) => setForm({ ...form, geo_region: e.target.value as Lead["geo_region"] })}>
                        {GEO_REGIONS.map((g) => (
                          <option key={g}>{g}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Role track</Label>
                      <Select value={form.role_track} onChange={(e) => setForm({ ...form, role_track: e.target.value as Lead["role_track"] })}>
                        {ROLE_TRACKS.map((g) => (
                          <option key={g}>{g}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label hint="1 sentence · own paragraph above the pitch">Custom icebreaker</Label>
                      <Textarea rows={2} value={form.custom_icebreaker ?? ""} onChange={(e) => setForm({ ...form, custom_icebreaker: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <Label hint="interview prep, comp, notice-period notes">Notes</Label>
                      <Textarea rows={6} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                    {lead.funnel_stage === "NURTURE_LATER" && (
                      <div className="col-span-2">
                        <Label>Re-engage at</Label>
                        <Input
                          type="date"
                          value={form.reengage_at ? form.reengage_at.slice(0, 10) : ""}
                          onChange={(e) => setForm({ ...form, reengage_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                        />
                      </div>
                    )}
                    <div className="col-span-2 flex items-center justify-between pt-2">
                      <Button variant="danger" size="sm" onClick={remove}>
                        <Trash2 className="h-3 w-3" /> Move to Trash
                      </Button>
                      <div className="flex items-center gap-2">
                        {dirty && (
                          <Button size="sm" variant="ghost" onClick={() => { setDirty(false); if (data?.lead) setFormState(data.lead); }}>
                            Discard
                          </Button>
                        )}
                      <Button
                        variant="primary"
                        disabled={!dirty || !!lead.deleted_at}
                        loading={busy === "Details saved"}
                        onClick={() =>
                          patch(
                            {
                              first_name: form.first_name,
                              last_name: form.last_name,
                              company_name: form.company_name,
                              job_title: form.job_title,
                              target_role_opening: form.target_role_opening,
                              linkedin_url: form.linkedin_url,
                              company_website: form.company_website,
                              geo_region: form.geo_region,
                              role_track: form.role_track,
                              custom_icebreaker: form.custom_icebreaker,
                              notes: form.notes,
                              ...(lead.funnel_stage === "NURTURE_LATER" ? { reengage_at: form.reengage_at } : {}),
                            },
                            "Details saved",
                            true,
                          )
                        }
                      >
                        Save details
                      </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
