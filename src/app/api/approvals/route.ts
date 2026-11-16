import { db, getSettings, must } from "@/lib/server/db";
import { fail, ok, readJson, route } from "@/lib/server/http";
import { composeNextTouch, loadTemplates } from "@/lib/server/sequencer";
import { branchFor, SENDABLE_STAGES } from "@/lib/funnel";
import { isInSendWindow } from "@/lib/schedule";
import type { ApprovalItem, EmailLog, Lead } from "@/lib/types";
import { UUID_RE } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/approvals — touches due within the next 24h, rendered with any saved draft edits. */
export const GET = route(async () => {
  const settings = await getSettings();
  const horizon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const leadsRes = await db()
    .from("leads")
    .select("*")
    .eq("sequence_active", true)
    .lt("current_touch", 4)
    .in("funnel_stage", SENDABLE_STAGES)
    .in("approval_status", ["PENDING", "APPROVED"])
    .lte("next_touch_due_at", horizon)
    .order("next_touch_due_at", { ascending: true })
    .limit(200);
  const leads = must(leadsRes, "load due leads") as Lead[];
  if (!leads.length) return ok({ items: [], mode: settings.execution_mode });

  const [templates, draftsRes] = await Promise.all([
    loadTemplates(),
    db()
      .from("email_logs")
      .select("*")
      .in("lead_id", leads.map((l) => l.id))
      .eq("status", "QUEUED_FOR_APPROVAL"),
  ]);
  const drafts = must(draftsRes, "load drafts") as EmailLog[];

  const items: ApprovalItem[] = [];
  for (const lead of leads) {
    const touch = lead.current_touch + 1;
    const draft = drafts.find((d) => d.lead_id === lead.id && d.touch_number === touch) ?? null;
    try {
      const c = await composeNextTouch(lead, templates, draft);
      items.push({
        lead,
        touchNumber: touch,
        variant: c.variant,
        subject: c.subject,
        body: c.body,
        hasDraft: Boolean(draft),
        inWindow: isInSendWindow(lead.geo_region, settings),
        dueAt: lead.next_touch_due_at,
      });
    } catch (e) {
      items.push({
        lead,
        touchNumber: touch,
        variant: branchFor(lead, touch),
        subject: "",
        body: "",
        hasDraft: false,
        inWindow: false,
        dueAt: lead.next_touch_due_at,
        error: (e as Error).message,
      });
    }
  }
  return ok({ items, mode: settings.execution_mode });
});

type Action =
  | { action: "save_draft"; leadId: string; subject: string; body: string }
  | { action: "reset_draft"; leadId: string }
  | { action: "approve" | "unapprove" | "pause"; leadIds: string[] };

/** POST /api/approvals — save/reset an edited draft, or approve / unapprove / pause a batch. */
export const POST = route(async (req: Request) => {
  const body = await readJson<Action>(req);

  if (body.action === "save_draft" || body.action === "reset_draft") {
    if (!UUID_RE.test(body.leadId ?? "")) return fail("leadId required");
    const lead = must(await db().from("leads").select("*").eq("id", body.leadId).single(), "load lead") as Lead;
    const touch = lead.current_touch + 1;
    await db().from("email_logs").delete().eq("lead_id", lead.id).eq("status", "QUEUED_FOR_APPROVAL");
    if (body.action === "reset_draft") return ok({ reset: true });

    if (typeof body.subject !== "string" || typeof body.body !== "string" || !body.subject.trim() || !body.body.trim())
      return fail("subject and body are required");
    if (body.subject.length > 300 || body.body.length > 20_000) return fail("subject or body is too long");
    const settings = await getSettings();
    const res = await db()
      .from("email_logs")
      .insert({
        lead_id: lead.id,
        touch_number: touch,
        branch_variant: branchFor(lead, touch),
        subject: body.subject.replace(/[\r\n]+/g, " ").trim(),
        // drafts keep the editable merged text; it is replaced by final HTML when sent
        body_html: body.body.replace(/\r\n/g, "\n").trim(),
        provider: settings.send_provider,
        status: "QUEUED_FOR_APPROVAL",
      })
      .select("*")
      .single();
    return ok({ draft: must(res, "save draft") });
  }

  if (body.action === "approve" || body.action === "unapprove" || body.action === "pause") {
    const ids = (Array.isArray(body.leadIds) ? body.leadIds : []).filter((id) => typeof id === "string" && UUID_RE.test(id)).slice(0, 1000);
    if (!ids.length) return fail("leadIds required");
    const status = body.action === "approve" ? "APPROVED" : body.action === "pause" ? "PAUSED" : "PENDING";
    const res = await db().from("leads").update({ approval_status: status }).in("id", ids).select("id");
    return ok({ updated: (must(res, "update approvals") as { id: string }[]).length, status });
  }

  return fail("unknown action");
});
