"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCheck, Clock, Eye, Pause, RotateCcw, Save, Send } from "lucide-react";
import { api, broadcastRefresh, usePoll } from "@/lib/client";
import { GEO_LABEL, touchLabel } from "@/lib/meta";
import { previewLinks, stripImages, toHtml } from "@/lib/render";
import { localTimeLabel } from "@/lib/schedule";
import type { ApprovalItem, ExecutionMode, QueueReport, SystemSettings } from "@/lib/types";
import { cn, fullName, relTime } from "@/lib/utils";
import { Badge, Button, Card, Empty, Input, Label, Textarea, toast } from "@/components/ui";

type Item = ApprovalItem;

const touchName = (i: Item) => touchLabel(i.touchNumber, i.variant, true);

function ApprovalCard({
  item,
  selected,
  onToggle,
  settings,
  onChanged,
}: {
  item: Item;
  selected: boolean;
  onToggle: () => void;
  settings: SystemSettings | null;
  onChanged: () => void;
}) {
  const [subject, setSubject] = useState(item.subject);
  const [body, setBody] = useState(item.body);
  const [ice, setIce] = useState(item.lead.custom_icebreaker ?? "");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setSubject(item.subject);
    setBody(item.body);
    setIce(item.lead.custom_icebreaker ?? "");
  }, [item.subject, item.body, item.lead.custom_icebreaker]);

  const dirty = subject !== item.subject || body !== item.body;
  const lead = item.lead;

  const html = useMemo(() => {
    if (!preview || !settings) return "";
    return stripImages(toHtml(body, previewLinks(lead.id, settings.portfolio_base_url, settings.resume_url, settings.linkedin_url)));
  }, [preview, settings, body, lead.id]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
      toast(label);
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className={cn("overflow-hidden", selected && "border-zinc-500")}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 accent-zinc-100" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{lead.company_name}</span>
            <span className="truncate text-xs text-muted">
              {fullName(lead)} · {lead.email}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={item.touchNumber === 2 && item.variant === "WARM" ? "amber" : "sky"}>{touchName(item)}</Badge>
            <Badge>{GEO_LABEL[lead.geo_region]}</Badge>
            <Badge tone="violet">{lead.role_track}</Badge>
            {item.hasDraft && <Badge tone="amber">EDITED</Badge>}
            {lead.approval_status === "APPROVED" && <Badge tone="emerald">APPROVED</Badge>}
            <span className="flex items-center gap-1 font-mono text-[10px] text-dim">
              <Clock className="h-3 w-3" />
              due {relTime(item.dueAt)} · {localTimeLabel(lead.geo_region)} ·{" "}
              <span className={item.inWindow ? "text-emerald-400" : "text-amber-400"}>{item.inWindow ? "in window" : "outside window"}</span>
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)}>
            <Eye className="h-3 w-3" /> {preview ? "Edit" : "Preview"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busy === "Paused"}
            onClick={() => run("Paused", () => api("/api/approvals", { method: "POST", json: { action: "pause", leadIds: [lead.id] } }))}
          >
            <Pause className="h-3 w-3" /> Pause
          </Button>
          {lead.approval_status === "APPROVED" ? (
            <Button
              size="sm"
              onClick={() => run("Approval revoked", () => api("/api/approvals", { method: "POST", json: { action: "unapprove", leadIds: [lead.id] } }))}
            >
              Revoke
            </Button>
          ) : (
            <Button
              size="sm"
              variant="success"
              disabled={dirty || !!item.error}
              title={dirty ? "Save your edits first" : undefined}
              onClick={() => run("Approved", () => api("/api/approvals", { method: "POST", json: { action: "approve", leadIds: [lead.id] } }))}
            >
              <CheckCheck className="h-3 w-3" /> Approve
            </Button>
          )}
        </div>
      </div>

      {item.error ? (
        <div className="px-4 py-3 font-mono text-xs text-rose-300">{item.error}</div>
      ) : preview ? (
        <div className="px-4 py-4">
          <div className="mb-3 text-sm font-medium">{subject}</div>
          <div className="email-body rounded-md border border-line bg-bg p-4 text-[13px] leading-relaxed text-muted" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      ) : (
        <div className="grid gap-3 px-4 py-4">
          <div>
            <Label hint={item.touchNumber > 1 ? "follow-ups reuse the original subject to stay in-thread" : undefined}>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={item.touchNumber > 1} />
          </div>
          <div>
            <Label hint="{{tracked_portfolio_url}} / {{tracked_resume_url}} become tracked links at send time">Body</Label>
            <Textarea rows={Math.min(22, Math.max(8, body.split("\n").length + 1))} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-[12.5px]" />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label hint={item.hasDraft ? "reset the draft to re-render with a new icebreaker" : "saved to the lead, re-renders the draft"}>Custom icebreaker</Label>
              <Input value={ice} onChange={(e) => setIce(e.target.value)} placeholder="Optional one-line personalised hook" />
            </div>
            <Button
              size="md"
              disabled={ice === (lead.custom_icebreaker ?? "")}
              loading={busy === "Icebreaker saved"}
              onClick={() => run("Icebreaker saved", () => api("/api/leads", { method: "PATCH", json: { id: lead.id, custom_icebreaker: ice } }))}
            >
              Update
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            {item.hasDraft && (
              <Button
                size="sm"
                variant="ghost"
                loading={busy === "Draft reset"}
                onClick={() => run("Draft reset", () => api("/api/approvals", { method: "POST", json: { action: "reset_draft", leadId: lead.id } }))}
              >
                <RotateCcw className="h-3 w-3" /> Reset to template
              </Button>
            )}
            <Button
              size="sm"
              disabled={!dirty}
              loading={busy === "Draft saved"}
              onClick={() => run("Draft saved", () => api("/api/approvals", { method: "POST", json: { action: "save_draft", leadId: lead.id, subject, body } }))}
            >
              <Save className="h-3 w-3" /> Save edits
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function ApprovalsPage() {
  const { data, reload, loading, error } = usePoll<{ items: Item[]; mode: ExecutionMode }>("/api/approvals", 0);
  const settingsPoll = usePoll<{ settings: SystemSettings }>("/api/settings", 0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dispatching, setDispatching] = useState(false);

  const items = data?.items ?? [];
  const pending = items.filter((i) => i.lead.approval_status === "PENDING" && !i.error);
  const approved = items.filter((i) => i.lead.approval_status === "APPROVED");

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function approveAndDispatch() {
    const ids = selected.size ? [...selected] : pending.map((i) => i.lead.id);
    if (!ids.length) return;
    setDispatching(true);
    try {
      await api("/api/approvals", { method: "POST", json: { action: "approve", leadIds: ids } });
      const r = await api<QueueReport>("/api/queue/run", { method: "POST" });
      const st = settingsPoll.data?.settings;
      const jitter = st ? `${st.min_delay_minutes}–${st.max_delay_minutes} min` : "human";
      toast(
        `${ids.length} approved · ${r.sent.length ? `sent to ${r.sent.map((s) => s.email).join(", ")}` : "queued"} — the rest dispatch with ${jitter} jitter inside each recipient's window.`,
      );
      if (r.failed.length) toast(r.failed.map((f) => `${f.email}: ${f.error}`).join(" | "), "err");
      setSelected(new Set());
      reload();
      broadcastRefresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Morning Approval Queue</h1>
          <p className="mt-1 text-sm text-dim">
            Touches due in the next 24h. Approved emails dispatch one at a time with human jitter, only inside each recipient&apos;s business hours.
          </p>
        </div>
        <Button variant="primary" onClick={approveAndDispatch} loading={dispatching} disabled={!pending.length && !selected.size}>
          <Send className="h-3.5 w-3.5" />
          Approve &amp; Dispatch {selected.size ? `${selected.size} selected` : `Batch (${pending.length})`}
        </Button>
      </div>

      {data?.mode === "AUTO_PILOT" && (
        <div className="mb-4 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-4 py-2.5 text-sm text-emerald-200">
          Auto-pilot is on — due touches send automatically without approval. You can still edit drafts or pause individual leads here.
        </div>
      )}
      {error && <div className="mb-4 text-sm text-rose-300">{error}</div>}

      <div className="mb-3 flex items-center gap-3 font-mono text-[11px] text-dim">
        <span>{pending.length} awaiting approval</span>
        <span>·</span>
        <span className="text-emerald-400">{approved.length} approved, waiting for window / jitter slot</span>
        {pending.length > 0 && (
          <button className="ml-auto hover:text-fg" onClick={() => setSelected(selected.size ? new Set() : new Set(pending.map((p) => p.lead.id)))}>
            {selected.size ? "clear selection" : "select all"}
          </button>
        )}
      </div>

      {loading && !data ? (
        <div className="h-40 animate-pulse rounded-lg bg-card" />
      ) : items.length === 0 ? (
        <Empty title="Inbox zero for outreach">Nothing is due in the next 24 hours. Import leads or check back tomorrow morning.</Empty>
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <ApprovalCard
              key={`${i.lead.id}-${i.touchNumber}`}
              item={i}
              selected={selected.has(i.lead.id)}
              onToggle={() => toggle(i.lead.id)}
              settings={settingsPoll.data?.settings ?? null}
              onChanged={() => {
                reload();
                broadcastRefresh();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
