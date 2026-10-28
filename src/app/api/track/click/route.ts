import { NextRequest, NextResponse } from 'next/server';
import { recordLinkClick } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get('lead');
  const emailLogId = searchParams.get('log');
  const linkType = searchParams.get('type') || 'portfolio';
  const targetUrl =
    searchParams.get('url') ||
    (leadId
      ? `https://sumandebnath.houseofnamus.com/?ref=${encodeURIComponent(leadId)}`
      : 'https://sumandebnath.houseofnamus.com');

  if (leadId) {
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const referer = req.headers.get('referer') || 'direct';

    try {
      await recordLinkClick({
        leadId,
        emailLogId,
        targetUrl,
        linkType,
        metadata: {
          userAgent,
          referer,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Never block redirect if telemetry write fails
    }
  }

  return NextResponse.redirect(targetUrl, {
    status: 302,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
