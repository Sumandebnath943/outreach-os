import { NextRequest, NextResponse } from 'next/server';
import { recordEmailOpen } from '@/lib/db';

// 1x1 transparent GIF binary buffer
const TRANSPARENT_GIF_BUFFER = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get('lead');
  const emailLogId = searchParams.get('log');

  if (leadId) {
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    // Non-blocking or awaited telemetry update
    try {
      await recordEmailOpen({
        leadId,
        emailLogId,
        metadata: {
          userAgent,
          ip,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Never fail pixel response
    }
  }

  return new NextResponse(TRANSPARENT_GIF_BUFFER, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(TRANSPARENT_GIF_BUFFER.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
