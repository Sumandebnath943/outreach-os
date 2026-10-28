import { NextRequest, NextResponse } from 'next/server';
import { recordPortfolioView } from '@/lib/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(req: NextRequest) {
  try {
    let payload: {
      ref?: string;
      lead_id?: string;
      path?: string;
      durationSec?: number;
      referrer?: string;
      title?: string;
    } = {};

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await req.json();
    } else {
      // Support navigator.sendBeacon text/plain JSON payloads
      const rawText = await req.text();
      if (rawText) {
        payload = JSON.parse(rawText);
      }
    }

    const leadId = (payload.ref || payload.lead_id || '').trim();
    const pagePath = (payload.path || '/').trim();
    const durationSec = typeof payload.durationSec === 'number' ? payload.durationSec : 0;

    if (!leadId) {
      return NextResponse.json(
        { error: 'Missing ref / lead_id parameter' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const userAgent = req.headers.get('user-agent') || 'unknown';
    const origin = req.headers.get('origin') || 'https://sumandebnath.houseofnamus.com';

    const updatedLead = await recordPortfolioView({
      leadId,
      pagePath,
      durationSec,
      metadata: {
        origin,
        userAgent,
        referrer: payload.referrer || null,
        title: payload.title || null,
      },
    });

    return NextResponse.json(
      {
        tracked: Boolean(updatedLead),
        leadId,
        path: pagePath,
        durationSec,
        stage: updatedLead?.funnel_stage || null,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to record portfolio view';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
