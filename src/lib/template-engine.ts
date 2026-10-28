import { BranchVariant, Lead, ROLE_TRACK_META, SequenceTemplate, SystemSettings } from '@/types/outreach';

export interface NextTouchResolution {
  touchNumber: 1 | 2 | 3 | 4;
  branchVariant: BranchVariant;
  reason: string;
}

/**
 * Evaluates a lead's current touch and telemetry counters to determine
 * the exact next touch number and Warm/Cold branch variant.
 */
export function resolveNextTouchVariant(lead: Pick<
  Lead,
  'current_touch' | 'click_count' | 'portfolio_visit_count' | 'open_count' | 'funnel_stage'
>): NextTouchResolution | null {
  const nextTouch = lead.current_touch + 1;
  if (nextTouch > 4) {
    return null;
  }

  if (nextTouch === 1) {
    return {
      touchNumber: 1,
      branchVariant: 'STANDARD',
      reason: 'Initial Cold Pitch (Day 0)',
    };
  }

  if (nextTouch === 2) {
    const isWarm =
      lead.click_count >= 1 ||
      lead.portfolio_visit_count >= 1 ||
      lead.open_count >= 2 ||
      lead.funnel_stage === 'WARM_ENGAGED';

    if (isWarm) {
      const signals: string[] = [];
      if (lead.portfolio_visit_count >= 1) signals.push(`${lead.portfolio_visit_count} portfolio visits`);
      if (lead.click_count >= 1) signals.push(`${lead.click_count} link clicks`);
      if (lead.open_count >= 2) signals.push(`${lead.open_count} email opens`);
      return {
        touchNumber: 2,
        branchVariant: 'WARM',
        reason: `Touch 2A Warm Branch (${signals.join(', ') || 'Warm Engaged'})`,
      };
    }

    return {
      touchNumber: 2,
      branchVariant: 'COLD',
      reason: `Touch 2B Cold Proof Bump (0 clicks, ${lead.open_count} opens)`,
    };
  }

  if (nextTouch === 3) {
    return {
      touchNumber: 3,
      branchVariant: 'STANDARD',
      reason: 'Touch 3 Value & AEO/Agentic Insight Shift (+5 Business Days)',
    };
  }

  return {
    touchNumber: 4,
    branchVariant: 'STANDARD',
    reason: 'Touch 4 Polite Executive Breakup (+6 Business Days)',
  };
}

export interface RenderedEmail {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  portfolioDirectUrl: string;
  resumeDirectUrl: string;
  trackedPortfolioClickUrl: string;
  trackedResumeClickUrl: string;
  openPixelUrl: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders a sequence template (or custom override subject/body) for a given lead,
 * resolving all merge variables and wrapping tracked click URLs + 1x1 open pixel.
 */
export function renderSequenceEmail(params: {
  lead: Lead;
  template: Pick<SequenceTemplate, 'subject_template' | 'body_template' | 'touch_number'>;
  settings: SystemSettings;
  appBaseUrl: string;
  emailLogId?: string;
  subjectOverride?: string;
  bodyOverride?: string;
}): RenderedEmail {
  const { lead, template, settings, appBaseUrl, emailLogId = 'preview', subjectOverride, bodyOverride } = params;

  const firstName = (lead.first_name || '').trim() || 'Team';
  const companyName = (lead.company_name || '').trim() || 'your team';
  const defaultRole = ROLE_TRACK_META[lead.role_track]?.defaultRoleTitle || 'Senior Brand Marketing / AI Product Marketing';
  const targetRoleOpening = (lead.target_role_opening || '').trim() || defaultRole;

  const rawIcebreaker = (lead.custom_icebreaker || '').trim();
  const formattedIcebreaker = rawIcebreaker ? `${rawIcebreaker}\n\n` : '';

  const portfolioBase = (settings.portfolio_base_url || 'https://sumandebnath.houseofnamus.com').replace(/\/+$/, '');
  const resumeBase = (settings.resume_url || 'https://sumandebnath.houseofnamus.com/resume').replace(/\/+$/, '');

  const portfolioDirectUrl = `${portfolioBase}/?ref=${encodeURIComponent(lead.id)}`;
  const resumeDirectUrl = `${resumeBase}?ref=${encodeURIComponent(lead.id)}`;

  const normalizedAppBase = (appBaseUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const trackedPortfolioClickUrl = `${normalizedAppBase}/api/track/click?lead=${encodeURIComponent(
    lead.id
  )}&log=${encodeURIComponent(emailLogId)}&type=portfolio&url=${encodeURIComponent(portfolioDirectUrl)}`;

  const trackedResumeClickUrl = `${normalizedAppBase}/api/track/click?lead=${encodeURIComponent(
    lead.id
  )}&log=${encodeURIComponent(emailLogId)}&type=resume&url=${encodeURIComponent(resumeDirectUrl)}`;

  const openPixelUrl = `${normalizedAppBase}/api/track/open?lead=${encodeURIComponent(
    lead.id
  )}&log=${encodeURIComponent(emailLogId)}`;

  // Compute original subject for thread replies
  const fallbackOriginalSubject = `9+ yrs Brand Marketing + 21 AI products shipped solo — Open roles at ${companyName}?`;
  const cleanOriginalSubject = (lead.original_subject || fallbackOriginalSubject).replace(/^Re:\s*/i, '');

  const rawSubject = subjectOverride ?? template.subject_template;
  const subject = rawSubject
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*company_name\s*\}\}/gi, companyName)
    .replace(/\{\{\s*target_role_opening\s*\}\}/gi, targetRoleOpening)
    .replace(/\{\{\s*original_subject\s*\}\}/gi, cleanOriginalSubject)
    .trim();

  const rawBody = bodyOverride ?? template.body_template;

  // 1. Plain-text version (uses clean visible URLs with ?ref={{lead_uuid}})
  const bodyText = rawBody
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*company_name\s*\}\}/gi, companyName)
    .replace(/\{\{\s*target_role_opening\s*\}\}/gi, targetRoleOpening)
    .replace(/\{\{\s*custom_icebreaker\s*\}\}/gi, formattedIcebreaker)
    .replace(/\{\{\s*original_subject\s*\}\}/gi, cleanOriginalSubject)
    .replace(/\{\{\s*tracked_portfolio_url\s*\}\}/gi, portfolioDirectUrl)
    .replace(/\{\{\s*tracked_resume_url\s*\}\}/gi, resumeDirectUrl)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 2. HTML version (converts paragraphs & bullets cleanly, wraps links with click tracker, and embeds 1x1 open pixel)
  const PORTFOLIO_TOKEN = '___OUTREACH_OS_PORTFOLIO_LINK___';
  const RESUME_TOKEN = '___OUTREACH_OS_RESUME_LINK___';

  const tokenizedText = rawBody
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*company_name\s*\}\}/gi, companyName)
    .replace(/\{\{\s*target_role_opening\s*\}\}/gi, targetRoleOpening)
    .replace(/\{\{\s*custom_icebreaker\s*\}\}/gi, formattedIcebreaker)
    .replace(/\{\{\s*original_subject\s*\}\}/gi, cleanOriginalSubject)
    .replace(/\{\{\s*tracked_portfolio_url\s*\}\}/gi, PORTFOLIO_TOKEN)
    .replace(/\{\{\s*tracked_resume_url\s*\}\}/gi, RESUME_TOKEN)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const blocks = tokenizedText.split(/\n\n+/);
  const htmlBlocks = blocks.map((block) => {
    const lines = block.split('\n');
    const isBulletBlock = lines.every((l) => l.trim().startsWith('- ') || l.trim().startsWith('• '));

    if (isBulletBlock) {
      const items = lines
        .map((l) => {
          const content = escapeHtml(l.trim().replace(/^[-•]\s+/, ''));
          return `<li style="margin-bottom: 6px;">${ content }</li>`;
        })
        .join('');
      return `<ul style="margin: 0 0 14px 0; padding-left: 20px;">${items}</ul>`;
    }

    const paragraphHtml = lines.map((line) => escapeHtml(line)).join('<br/>');
    return `<p style="margin: 0 0 14px 0;">${paragraphHtml}</p>`;
  });

  const portfolioAnchor = `<a href="${trackedPortfolioClickUrl}" style="color: #2563eb; text-decoration: underline; font-weight: 500;">${escapeHtml(
    portfolioDirectUrl
  )}</a>`;

  const resumeAnchor = `<a href="${trackedResumeClickUrl}" style="color: #2563eb; text-decoration: underline; font-weight: 500;">${escapeHtml(
    resumeDirectUrl
  )}</a>`;

  const assembledHtml = htmlBlocks
    .join('\n')
    .replace(new RegExp(PORTFOLIO_TOKEN, 'g'), portfolioAnchor)
    .replace(new RegExp(RESUME_TOKEN, 'g'), resumeAnchor);

  const bodyHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 640px;">
${assembledHtml}
<img src="${openPixelUrl}" width="1" height="1" alt="" style="display:none !important;width:1px !important;height:1px !important;border:0 !important;" />
</div>`;

  return {
    subject,
    bodyText,
    bodyHtml,
    portfolioDirectUrl,
    resumeDirectUrl,
    trackedPortfolioClickUrl,
    trackedResumeClickUrl,
    openPixelUrl,
  };
}
