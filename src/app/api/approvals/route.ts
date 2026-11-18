import { db, getSettings, must } from "@/lib/server/db";
import { fail, ok, readJson, route } from "@/lib/server/http";
import { composeNextTouch, loadTemplates } from "@/lib/server/sequencer";
import { branchFor, SENDABLE_STAGES } from "@/lib/funnel";
import { isInSendWindow } from "@/lib/schedule";
import { findUnresolved } from "@/lib/render";
import type { ApprovalItem, EmailLog, Lead } from "@/lib/types";
import { UUID_RE } from "@/lib/utils";
import { approvalQuery, collectIds, filtersFrom, pagination } from "@/lib/server/lead-query";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/approvals — touches due within the next 24h, rendered with any saved draft edits. */
export const GET = route(async (req: Request) => {
  const settings = await getSettings();
  const sp = new URL(req.url).searchParams;
  const filters = filtersFrom(sp);
  filters.status ||= "PENDING";
  const p = pagination(sp);
  const leadsRes = await approvalQuery(filters).order("next_touch_due_at").order("id").range(p.from, p.to);
  const counts = Object.fromEntries(await Promise.all(["PENDING", "APPROVED", "PAUSED"].map(async status => {
    const result = await approvalQuery({ ...filters, status }, "id").range(0, 0);
    must(result, "count approvals");
    return [status, result.count ?? 0];
  })));
  const meta = { total: leadsRes.count ?? 0, page: p.page, pageSize: p.pageSize, counts, mode: settings.execution_mode };
  const leads = must(leadsRes, "load due leads") as unknown as Lead[];
  if (!leads.length) return ok({ items: [], ...meta });

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
      const c = await composeNextTouch(lead, templates, draft, settings.email_signature);
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
  return ok({ items, ...meta });
});

type Action =
  | { action: "save_draft"; leadId: string; subject: string; body: string }
  | { action: "reset_draft"; leadId: string }
  | { action: "approve" | "unapprove" | "pause"; leadIds?: string[]; allMatching?: boolean; filters?: Record<string, string> };

/** POST /api/approvals — save/reset an edited draft, or approve / unapprove / pause a batch. */
export const POST = route(async (req: Request) => {
  const body = await readJson<Action>(req);

  if (body.action === "save_draft" || body.action === "reset_draft") {
    if (!UUID_RE.test(body.leadId ?? "")) return fail("leadId required");
    const lead = must(await db().from("leads").select("*").eq("id", body.leadId).single(), "load lead") as Lead;
    if (lead.deleted_at || !lead.sequence_active || lead.current_touch >= 4) return fail("Lead is not eligible for a draft", 409);
    const touch = lead.current_touch + 1;
    if (body.action === "reset_draft") {
      must(await db().from("email_logs").delete().eq("lead_id", lead.id).eq("status", "QUEUED_FOR_APPROVAL").select("id"), "reset draft");
      await db().from("leads").update({ approval_status: "PENDING" }).eq("id", lead.id);
      return ok({ reset: true });
    }

    if (typeof body.subject !== "string" || typeof body.body !== "string" || !body.subject.trim() || !body.body.trim())
      return fail("subject and body are required");
    if (body.subject.length > 300 || body.body.length > 20_000) return fail("subject or body is too long");
    must(await db().from("email_logs").delete().eq("lead_id", lead.id).eq("status", "QUEUED_FOR_APPROVAL").select("id"), "replace draft");
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
    const draft = must(res, "save draft");
    must(await db().from("leads").update({ approval_status: "PENDING" }).eq("id", lead.id).select("id"), "revoke edited approval");
    return ok({ draft });
  }

  if (body.action === "approve" || body.action === "unapprove" || body.action === "pause") {
    const filters = filtersFrom(new URLSearchParams(body.filters));
    if (body.action === "approve") filters.status = "PENDING";
    const ids = body.allMatching
      ? await collectIds((a, b) => approvalQuery(filters, "id").order("id").range(a, b))
      : [...new Set(body.leadIds ?? [])];
    if (!body.allMatching && (!ids.length || ids.length > 1000 || ids.some(id => typeof id !== "string" || !UUID_RE.test(id)))) return fail("Select 1–1,000 valid lead IDs or use all matching");
    const status = body.action === "approve" ? "APPROVED" : body.action === "pause" ? "PAUSED" : "PENDING";
    let updated = 0;
    let skipped = 0;
    const templates = body.action === "approve" ? await loadTemplates() : [];
    const settings = body.action === "approve" ? await getSettings() : null;
    for (let i = 0; i < ids.length; i += 200) {
      if (body.action === "approve") {
        const chunk = ids.slice(i, i + 200);
        const candidates = must(await approvalQuery({ status: "PENDING" }).in("id", chunk), "validate approvals") as unknown as Lead[];
        const drafts = must(await db().from("email_logs").select("*").in("lead_id", chunk).eq("status", "QUEUED_FOR_APPROVAL"), "validate drafts") as EmailLog[];
        const valid: Lead[] = [];
        for (const lead of candidates) {
          try {
            const draft = await composeNextTouch(lead, templates, drafts.find(d => d.lead_id === lead.id && d.touch_number === lead.current_touch + 1) ?? null, settings?.email_signature);
            if (findUnresolved(`${draft.subject}\n${draft.body}`).length) { skipped++; continue; }
            valid.push(lead);
          } catch { skipped++; }
        }
        // Approval is for the touch reviewed. A concurrently sent touch must not approve its successor.
        for (const touch of [0, 1, 2, 3]) {
          const group = valid.filter(l => l.current_touch === touch).map(l => l.id);
          if (!group.length) continue;
          updated += (must(await db().from("leads").update({ approval_status: "APPROVED" }).in("id", group)
            .is("deleted_at", null).eq("sequence_active", true).eq("approval_status", "PENDING").eq("current_touch", touch)
            .in("funnel_stage", SENDABLE_STAGES).select("id"), "approve reviewed touch") as { id: string }[]).length;
        }
        continue;
      }
      const q = db().from("leads").update({ approval_status: status }).in("id", ids.slice(i, i + 200))
        .is("deleted_at", null).eq("sequence_active", true).lt("current_touch", 4).in("funnel_stage", SENDABLE_STAGES);
      updated += (must(await q.select("id"), "update approvals") as { id: string }[]).length;
    }
    return ok({ updated, skipped, status });
  }

  return fail("unknown action");
});
