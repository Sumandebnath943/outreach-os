"use client";

import { Eye, Flame, Globe, MousePointerClick, PauseCircle, MessageSquareReply } from "lucide-react";
import { isWarm } from "@/lib/funnel";
import { GEO_LABEL, TRACK_LABEL } from "@/lib/meta";
import type { Lead } from "@/lib/types";
import { STATUS_TONE, TRACK_TONE, GEO_TONE } from "@/lib/theme";
import { cn, fullName, relTime } from "@/lib/utils";
import { Badge } from "../ui";

export function LeadCard({ lead, onOpen, dragging }: { lead: Lead; onOpen: () => void; dragging?: boolean }) {
  const warm = isWarm(lead);
  const pages = lead.portfolio_pages_viewed?.length ?? 0;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/lead-id", lead.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      className={cn(
        "group cursor-pointer rounded-md border border-line bg-card p-3 transition-colors hover:border-line-strong hover:bg-raised",
        dragging && "opacity-40",
        lead.funnel_stage === "WARM_ENGAGED" && "border-stage-engaged/30",
        lead.funnel_stage === "REPLIED_TRIAGE" && "border-stage-replied/30",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold tracking-tight">{lead.company_name}</div>
          <div className="truncate text-xs text-muted">
            {fullName(lead)}
            {lead.job_title && <span className="text-dim"> · {lead.job_title}</span>}
          </div>
        </div>
        {warm && lead.sequence_active && (
          <span className="pulse-warm mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning/10" title="High intent">
            <Flame className="h-3 w-3 text-warning" />
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Badge tone={GEO_TONE[lead.geo_region]}>{GEO_LABEL[lead.geo_region]}</Badge>
        <Badge tone={TRACK_TONE[lead.role_track]}>{TRACK_LABEL[lead.role_track]}</Badge>
        <Badge tone={lead.current_touch >= 4 ? "pink" : lead.current_touch === 3 ? "teal" : lead.current_touch > 0 ? "info" : "neutral"}>
          {lead.current_touch === 0 ? "T0" : `T${lead.current_touch}`}/4
        </Badge>
        {lead.sub_stage && <Badge tone={STATUS_TONE[lead.sub_stage] ?? 'neutral'}>{lead.sub_stage}</Badge>}
        {lead.reply_sentiment && (
          <Badge tone={STATUS_TONE[lead.reply_sentiment] ?? "neutral"}>
            <MessageSquareReply className="h-2.5 w-2.5" />
            {lead.reply_sentiment}
          </Badge>
        )}
        {lead.approval_status === "PAUSED" && (
          <Badge tone={STATUS_TONE.PAUSED}>
            <PauseCircle className="h-2.5 w-2.5" /> PAUSED
          </Badge>
        )}
        {lead.approval_status === "APPROVED" && lead.sequence_active && <Badge tone="emerald">APPROVED</Badge>}
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2 font-mono text-[11px] text-dim">
        <div className="flex items-center gap-2.5 tabular">
          <span className={cn("flex items-center gap-1", lead.open_count > 0 && "text-info")} title="Opens">
            <Eye className="h-3 w-3" />
            {lead.open_count}
          </span>
          <span className={cn("flex items-center gap-1", lead.click_count > 0 && "text-warning")} title="Clicks">
            <MousePointerClick className="h-3 w-3" />
            {lead.click_count}
          </span>
          <span className={cn("flex items-center gap-1", pages > 0 && "text-teal")} title="Portfolio pages viewed">
            <Globe className="h-3 w-3" />
            {pages}
          </span>
        </div>
        <span title={lead.next_touch_due_at ?? ""}>
          {lead.sequence_active && lead.next_touch_due_at
            ? `${lead.current_touch >= 4 ? "archive" : `T${lead.current_touch + 1}`} ${relTime(lead.next_touch_due_at)}`
            : relTime(lead.last_engaged_at ?? lead.updated_at)}
        </span>
      </div>
    </div>
  );
}
