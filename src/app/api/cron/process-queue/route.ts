import { NextRequest, NextResponse } from 'next/server';
import {
  dispatchNextTouchForLead,
  getGlobalKPIs,
  getLeads,
  getSystemSettings,
  getTodaySentEmailCount,
  recordHardBounce,
  recordInboundReply,
  updateLead,
} from '@/lib/db';
import { pollGmailThreadForReply } from '@/lib/email-engine';
import { computeJitterMs, isWithinSendingWindow } from '@/lib/timezone';

async function executeQueueCycle(req: NextRequest, ignoreTimezoneWindow = false) {
  // Verify CRON_SECRET if request comes from external scheduler and CRON_SECRET is configured
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isInternalUiCall = req.headers.get('x-outreach-manual-trigger') === 'true';

  if (cronSecret && !isInternalUiCall && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized cron invocation' }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const settings = await getSystemSettings();
  const allLeads = await getLeads();
  const now = new Date();
  const nowIso = now.toISOString();

  const summary = {
    threadsPolled: 0,
    repliesDetected: 0,
    bouncesDetected: 0,
    ghostedArchived: 0,
    nurtureResurfaced: 0,
    emailsDispatched: 0,
    skippedOutsideWindow: 0,
    awaitingApprovalGate: 0,
    dailyQuotaRemaining: 0,
    jitterSchedulePlan: [] as { email: string; company: string; touch: number; jitterSeconds: number }[],
    errors: [] as string[],
  };

  // =========================================================================
  // STEP 1: Poll Gmail threads for active leads & halt anyone who replied
  // =========================================================================
  const activeThreadedLeads = allLeads.filter(
    (l) =>
      l.sequence_active &&
      l.gmail_thread_id &&
      (l.funnel_stage === 'OUTREACH_ACTIVE' || l.funnel_stage === 'WARM_ENGAGED')
  );

  for (const lead of activeThreadedLeads) {
    summary.threadsPolled += 1;
    const poll = await pollGmailThreadForReply(lead, settings);
    if (poll.status === 'REPLIED') {
      await recordInboundReply({
        leadId: lead.id,
        snippet: poll.snippet || 'Inbound reply detected by Cron Thread Poller.',
        repliedAt: poll.repliedAt,
      });
      summary.repliesDetected += 1;
    } else if (poll.status === 'BOUNCED') {
      await recordHardBounce({
        leadId: lead.id,
        snippet: poll.snippet || 'Hard bounce detected by Cron Thread Poller.',
      });
      summary.bouncesDetected += 1;
    }
  }

  // =========================================================================
  // STEP 2: Resurface NURTURE_LATER leads whose reengage_at <= now
  // =========================================================================
  const nurtureDueLeads = allLeads.filter(
    (l) =>
      l.funnel_stage === 'NURTURE_LATER' &&
      l.reengage_at &&
      l.reengage_at <= nowIso
  );

  for (const lead of nurtureDueLeads) {
    await updateLead(lead.id, {
      funnel_stage: 'WARM_ENGAGED',
      sequence_active: true,
      approval_status: 'PENDING',
      next_touch_due_at: nowIso,
      notes: `${lead.notes ? lead.notes + '\n' : ''}[AUTO-RESURFACED]: Re-engage timer reached (${nowIso.slice(0, 10)}).`,
    });
    summary.nurtureResurfaced += 1;
  }

  // =========================================================================
  // STEP 3: Auto-Archive ghosted Touch 4 leads (+4 business days after T4, Day 18)
  // =========================================================================
  const refreshedLeadsAfterPoll = await getLeads();
  const ghostedTouch4Leads = refreshedLeadsAfterPoll.filter(
    (l) =>
      l.sequence_active &&
      l.current_touch >= 4 &&
      l.next_touch_due_at &&
      l.next_touch_due_at <= nowIso &&
      !l.replied_at
  );

  for (const lead of ghostedTouch4Leads) {
    await updateLead(lead.id, {
      funnel_stage: 'CLOSED_ARCHIVE',
      sub_stage: 'GHOSTED',
      sequence_active: false,
      approval_status: 'PAUSED',
      next_touch_due_at: null,
      notes: `${lead.notes ? lead.notes + '\n' : ''}[AUTO-ARCHIVE]: 4 touches completed with no reply by Day 18 (GHOSTED).`,
    });
    summary.ghostedArchived += 1;
  }

  // =========================================================================
  // STEP 4: Evaluate Warm/Cold branching & dispatch due touches within limits
  // =========================================================================
  let sentToday = await getTodaySentEmailCount();
  summary.dailyQuotaRemaining = Math.max(0, settings.daily_send_limit - sentToday);

  const dueCandidates = refreshedLeadsAfterPoll.filter(
    (l) =>
      l.sequence_active &&
      l.current_touch < 4 &&
      l.approval_status !== 'PAUSED' &&
      (l.funnel_stage === 'LEAD_QUEUED' ||
        l.funnel_stage === 'OUTREACH_ACTIVE' ||
        l.funnel_stage === 'WARM_ENGAGED') &&
      (!l.next_touch_due_at || l.next_touch_due_at <= nowIso)
  );

  for (const lead of dueCandidates) {
    if (sentToday >= settings.daily_send_limit) {
      break;
    }

    // Check APPROVAL_GATE vs AUTO_PILOT
    if (settings.execution_mode === 'APPROVAL_GATE' && lead.approval_status !== 'APPROVED') {
      summary.awaitingApprovalGate += 1;
      continue;
    }

    // Check Recipient Timezone Sending Window (INDIA IST, US EST, GLOBAL UTC)
    const windowCheck = isWithinSendingWindow(lead.geo_region, now);
    if (!windowCheck.allowed && !ignoreTimezoneWindow) {
      summary.skippedOutsideWindow += 1;
      continue;
    }

    const jitterMs = computeJitterMs(
      settings.min_delay_minutes,
      settings.max_delay_minutes
    );

    const res = await dispatchNextTouchForLead({
      leadId: lead.id,
      appBaseUrl: origin,
    });

    if (res.success) {
      sentToday += 1;
      summary.emailsDispatched += 1;
      summary.jitterSchedulePlan.push({
        email: lead.email,
        company: lead.company_name,
        touch: res.lead.current_touch,
        jitterSeconds: Math.round(jitterMs / 1000),
      });
    } else if (res.error) {
      summary.errors.push(`${lead.email}: ${res.error}`);
    }
  }

  summary.dailyQuotaRemaining = Math.max(0, settings.daily_send_limit - sentToday);
  const kpis = await getGlobalKPIs();

  return NextResponse.json({
    ok: true,
    executedAt: nowIso,
    executionMode: settings.execution_mode,
    summary,
    kpis,
  });
}

export async function GET(req: NextRequest) {
  return executeQueueCycle(req, false);
}

export async function POST(req: NextRequest) {
  let ignoreWindow = false;
  try {
    const body = await req.json();
    ignoreWindow = Boolean(body?.ignoreTimezoneWindow);
  } catch {
    // Empty body is valid for cron POST
  }
  return executeQueueCycle(req, ignoreWindow);
}
