"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, Clock, Eye, Pause, RotateCcw, Save } from "lucide-react";
import { api } from "@/lib/client";
import { GEO_LABEL, touchLabel } from "@/lib/meta";
import { previewLinks, stripImages, toHtml } from "@/lib/render";
import { localTimeLabel } from "@/lib/schedule";
import type { ApprovalItem, SystemSettings } from "@/lib/types";
import { cn, fullName, relTime } from "@/lib/utils";
import { Badge, Button, Card, Input, Label, Textarea, toast } from "@/components/ui";

type Item = ApprovalItem;

const touchName = (i: Item) => touchLabel(i.touchNumber, i.variant, true);

export function ApprovalCard({
  item,
  selected,
  onToggle,
  settings,
  onChanged,
  onDirty,
}: {
  item: Item;
  selected: boolean;
  onToggle: () => void;
  settings: SystemSettings | null;
  onChanged: () => void;
  onDirty?: (dirty: boolean) => void;
}) {
  const [subject, setSubject] = useState(item.subject);
  const [body, setBody] = useState(item.body);
  const [ice, setIce] = useState(item.lead.custom_icebreaker ?? "");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const editing = useRef(false);
  const dirty = subject !== item.subject || body !== item.body;
  const unsaved = dirty || ice !== (item.lead.custom_icebreaker ?? "");
  useEffect(() => { onDirty?.(unsaved); }, [unsaved, onDirty]);

  useEffect(() => {
    if (editing.current) return;
    setSubject(item.subject);
    setBody(item.body);
    setIce(item.lead.custom_icebreaker ?? "");
  }, [item.subject, item.body, item.lead.custom_icebreaker, unsaved]);

  const lead = item.lead;

  const html = useMemo(() => {
    if (!preview || !settings) return "";
    return stripImages(toHtml(body, previewLinks(lead.id, settings.portfolio_base_url, settings.resume_url, settings.linkedin_url)));
  }, [preview, settings, body, lead.id]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
      if (label === "Draft saved" || label === "Draft reset" || (label === "Icebreaker saved" && !dirty)) editing.current = false;
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
              <span className={item.inWindow ? "text-success" : "text-warning"}>{item.inWindow ? "in window" : "outside window"}</span>
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
              disabled={unsaved || !!item.error}
              title={dirty ? "Save your edits first" : undefined}
              onClick={() => run("Approved", () => api("/api/approvals", { method: "POST", json: { action: "approve", leadIds: [lead.id] } }))}
            >
              <CheckCheck className="h-3 w-3" /> Approve
            </Button>
          )}
        </div>
      </div>

      {item.error ? (
        <div className="px-4 py-3 font-mono text-xs text-danger">{item.error}</div>
      ) : preview ? (
        <div className="px-4 py-4">
          <div className="mb-3 text-sm font-medium">{subject}</div>
          <div className="email-body rounded-md border border-line bg-bg p-4 text-[13px] leading-relaxed text-muted" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      ) : (
        <div className="grid gap-3 px-4 py-4">
          <div>
            <Label hint={item.touchNumber > 1 ? "follow-ups reuse the original subject to stay in-thread" : undefined}>Subject</Label>
            <Input aria-label="Email subject" value={subject} onChange={(e) => { editing.current = true; setSubject(e.target.value); }} disabled={item.touchNumber > 1} />
          </div>
          <div>
            <Label hint="{{tracked_portfolio_url}} / {{tracked_resume_url}} become tracked links at send time">Body</Label>
            <Textarea aria-label="Email body" rows={Math.min(22, Math.max(8, body.split("\n").length + 1))} value={body} onChange={(e) => { editing.current = true; setBody(e.target.value); }} className="font-mono text-[12.5px]" />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label hint={item.hasDraft ? "reset the draft to re-render with a new icebreaker" : "saved to the lead, re-renders the draft"}>Custom icebreaker</Label>
              <Input aria-label="Custom icebreaker" value={ice} onChange={(e) => { editing.current = true; setIce(e.target.value); }} placeholder="Optional one-line personalised hook" />
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
