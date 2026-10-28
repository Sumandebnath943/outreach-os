import { NextRequest, NextResponse } from 'next/server';
import {
  deleteLead,
  dispatchNextTouchForLead,
  findSequenceTemplate,
  getEmailLogsForLead,
  getLeadById,
  getSystemSettings,
  getTrackingEventsForLead,
  recordEmailOpen,
  recordInboundReply,
  recordLinkClick,
  recordPortfolioView,
  updateLead,
} from '@/lib/db';
import { renderSequenceEmail, resolveNextTouchVariant } from '@/lib/template-engine';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const lead = await getLeadById(id);
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const [emailLogs, trackingEvents, settings] = await Promise.all([
      getEmailLogsForLead(id),
      getTrackingEventsForLead(id),
      getSystemSettings(),
    ]);

    const origin = new URL(req.url).origin;
    const nextResolution = resolveNextTouchVariant(lead);
    let nextTouchPreview = null;

    if (nextResolution) {
      const template = await findSequenceTemplate(
        lead.role_track,
        nextResolution.touchNumber,
        nextResolution.branchVariant
      );
      const rendered = renderSequenceEmail({
        lead,
        template,
        settings,
        appBaseUrl: origin,
      });
      nextTouchPreview = {
        touchNumber: nextResolution.touchNumber,
        branchVariant: nextResolution.branchVariant,
        reason: nextResolution.reason,
        subject: rendered.subject,
        bodyText: rendered.bodyText,
        bodyHtml: rendered.bodyHtml,
        sameThread: template.same_thread,
      };
    }

    return NextResponse.json({
      lead,
      emailLogs,
      trackingEvents,
      nextTouchPreview,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch lead dossier';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const origin = new URL(req.url).origin;

    // 1. Dispatch Next Touch Immediately
    if (body.action === 'DISPATCH_NEXT_TOUCH') {
      const result = await dispatchNextTouchForLead({
        leadId: id,
        appBaseUrl: origin,
        subjectOverride: body.subject,
        bodyOverride: body.body,
        customIcebreakerOverride: body.custom_icebreaker,
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    // 2. Simulate Telemetry Event (for live testing Open, Click, Portfolio View, or Inbound Reply)
    if (body.action === 'SIMULATE_EVENT') {
      const eventType = body.eventType as string;
      let updatedLead = null;

      if (eventType === 'EMAIL_OPEN') {
        updatedLead = await recordEmailOpen({
          leadId: id,
          metadata: { source: 'Command Bar Telemetry Test', userAgent: 'Mozilla/5.0 (Macintosh)' },
        });
      } else if (eventType === 'LINK_CLICK') {
        updatedLead = await recordLinkClick({
          leadId: id,
          targetUrl: `https://sumandebnath.houseofnamus.com/?ref=${id}`,
          linkType: 'portfolio',
          metadata: { source: 'Command Bar Telemetry Test' },
        });
      } else if (eventType === 'PORTFOLIO_VIEW') {
        updatedLead = await recordPortfolioView({
          leadId: id,
          pagePath: body.path || '/agents/migi',
          durationSec: body.durationSec || 84,
          metadata: { source: 'sumandebnath.houseofnamus.com' },
        });
      } else if (eventType === 'REPLY_RECEIVED') {
        updatedLead = await recordInboundReply({
          leadId: id,
          snippet:
            body.snippet ||
            'Hi Suman — reviewed your portfolio and MIGI architecture. Are you available for a 20-minute intro call this week?',
          sentiment: 'POSITIVE',
          metadata: { source: 'Gmail Thread Poller' },
        });
      }

      return NextResponse.json({ lead: updatedLead });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Action failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const patch = await req.json();
    const updated = await updateLead(id, patch);
    return NextResponse.json({ lead: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update lead';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await deleteLead(id);
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete lead';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
