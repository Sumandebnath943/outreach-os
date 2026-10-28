import { NextRequest, NextResponse } from 'next/server';
import {
  dispatchNextTouchForLead,
  findSequenceTemplate,
  getGlobalKPIs,
  getLeadById,
  getLeads,
  getSystemSettings,
  getTodaySentEmailCount,
  recordHardBounce,
  recordInboundReply,
  updateLead,
} from '@/lib/db';
import { pollGmailThreadForReply } from '@/lib/email-engine';
import { renderSequenceEmail, resolveNextTouchVariant } from '@/lib/template-engine';
import { isWithinSendingWindow } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  try {
    const origin = new URL(req.url).origin;
    const [allLeads, settings, kpis] = await Promise.all([
      getLeads(),
      getSystemSettings(),
      getGlobalKPIs(),
    ]);

    const nowIso = new Date().toISOString();

    // Filter leads that are active in sequence, haven't finished Touch 4, and are due (or queued at Touch 0)
    const dueLeads = allLeads.filter(
      (l) =>
        l.sequence_active &&
        l.current_touch < 4 &&
        l.approval_status !== 'PAUSED' &&
        (l.funnel_stage === 'LEAD_QUEUED' ||
          l.funnel_stage === 'OUTREACH_ACTIVE' ||
          l.funnel_stage === 'WARM_ENGAGED') &&
        (!l.next_touch_due_at || l.next_touch_due_at <= nowIso)
    );

    const queueItems = await Promise.all(
      dueLeads.map(async (lead) => {
        const resolution = resolveNextTouchVariant(lead)!;
        const template = await findSequenceTemplate(
          lead.role_track,
          resolution.touchNumber,
          resolution.branchVariant
        );
        const rendered = renderSequenceEmail({
          lead,
          template,
          settings,
          appBaseUrl: origin,
        });
        const windowStatus = isWithinSendingWindow(lead.geo_region);

        return {
          lead,
          touchNumber: resolution.touchNumber,
          branchVariant: resolution.branchVariant,
          branchReason: resolution.reason,
          subject: rendered.subject,
          bodyText: rendered.bodyText,
          bodyHtml: rendered.bodyHtml,
          sameThread: template.same_thread && resolution.touchNumber > 1,
          windowStatus,
        };
      })
    );

    return NextResponse.json({
      items: queueItems,
      settings,
      kpis,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load approval queue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const origin = new URL(req.url).origin;
    const body = await req.json();
    const settings = await getSystemSettings();

    if (body.action === 'PAUSE_LEAD') {
      const updated = await updateLead(body.leadId, {
        approval_status: 'PAUSED',
        sequence_active: false,
      });
      const kpis = await getGlobalKPIs();
      return NextResponse.json({ lead: updated, kpis });
    }

    if (body.action === 'DISPATCH_SINGLE') {
      const sentToday = await getTodaySentEmailCount();
      if (sentToday >= settings.daily_send_limit) {
        return NextResponse.json(
          {
            error: `Daily send limit reached (${sentToday}/${settings.daily_send_limit}). Increase limit in Settings or wait until tomorrow.`,
          },
          { status: 429 }
        );
      }

      const lead = await getLeadById(body.leadId);
      if (!lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }

      // Pre-Send Thread Verification (Instant Reply Kill-Switch)
      if (lead.current_touch > 0 && lead.gmail_thread_id) {
        const poll = await pollGmailThreadForReply(lead, settings);
        if (poll.status === 'REPLIED') {
          const haltedLead = await recordInboundReply({
            leadId: lead.id,
            snippet: poll.snippet || 'Inbound reply detected prior to send.',
            repliedAt: poll.repliedAt,
          });
          const kpis = await getGlobalKPIs();
          return NextResponse.json({
            haltedByReply: true,
            lead: haltedLead,
            kpis,
            message: `Halted! Inbound reply detected from ${lead.email}. Moved to Replied (Triage).`,
          });
        }
        if (poll.status === 'BOUNCED') {
          const bouncedLead = await recordHardBounce({
            leadId: lead.id,
            snippet: poll.snippet || 'Address bounced.',
          });
          const kpis = await getGlobalKPIs();
          return NextResponse.json({
            haltedByBounce: true,
            lead: bouncedLead,
            kpis,
            message: `Halted! Bounce detected for ${lead.email}. Moved to Closed / Archive.`,
          });
        }
      }

      const dispatchRes = await dispatchNextTouchForLead({
        leadId: lead.id,
        appBaseUrl: origin,
        subjectOverride: body.subject,
        bodyOverride: body.body,
        customIcebreakerOverride: body.custom_icebreaker,
      });

      if (!dispatchRes.success) {
        return NextResponse.json({ error: dispatchRes.error }, { status: 400 });
      }

      const kpis = await getGlobalKPIs();
      return NextResponse.json({
        dispatched: true,
        lead: dispatchRes.lead,
        emailLog: dispatchRes.emailLog,
        kpis,
      });
    }

    if (body.action === 'DISPATCH_BATCH') {
      const items: {
        leadId: string;
        subject?: string;
        body?: string;
        custom_icebreaker?: string;
      }[] = Array.isArray(body.items) ? body.items : [];

      let sentToday = await getTodaySentEmailCount();
      const dispatchedIds: string[] = [];
      const haltedByReplyIds: string[] = [];
      const errors: { leadId: string; error: string }[] = [];

      for (const item of items) {
        if (sentToday >= settings.daily_send_limit) {
          errors.push({
            leadId: item.leadId,
            error: `Daily send limit (${settings.daily_send_limit}) reached.`,
          });
          break;
        }

        const lead = await getLeadById(item.leadId);
        if (!lead || !lead.sequence_active) continue;

        // Pre-send reply check
        if (lead.current_touch > 0 && lead.gmail_thread_id) {
          const poll = await pollGmailThreadForReply(lead, settings);
          if (poll.status === 'REPLIED') {
            await recordInboundReply({
              leadId: lead.id,
              snippet: poll.snippet || 'Inbound reply detected during batch pre-check.',
              repliedAt: poll.repliedAt,
            });
            haltedByReplyIds.push(lead.id);
            continue;
          }
          if (poll.status === 'BOUNCED') {
            await recordHardBounce({
              leadId: lead.id,
              snippet: poll.snippet || 'Bounce detected during batch pre-check.',
            });
            continue;
          }
        }

        const res = await dispatchNextTouchForLead({
          leadId: lead.id,
          appBaseUrl: origin,
          subjectOverride: item.subject,
          bodyOverride: item.body,
          customIcebreakerOverride: item.custom_icebreaker,
        });

        if (res.success) {
          dispatchedIds.push(lead.id);
          sentToday += 1;
        } else {
          errors.push({ leadId: lead.id, error: res.error || 'Dispatch failed' });
        }
      }

      const kpis = await getGlobalKPIs();
      return NextResponse.json({
        dispatchedCount: dispatchedIds.length,
        haltedByReplyCount: haltedByReplyIds.length,
        dispatchedIds,
        haltedByReplyIds,
        errors,
        kpis,
      });
    }

    return NextResponse.json({ error: 'Invalid approval action' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Approval dispatch failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
