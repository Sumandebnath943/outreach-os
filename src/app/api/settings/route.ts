import { NextRequest, NextResponse } from 'next/server';
import {
  getGlobalKPIs,
  getSystemSettings,
  isSupabaseConfigured,
  updateSystemSettings,
} from '@/lib/db';
import { hasLiveEmailCredentials } from '@/lib/email-engine';

export async function GET() {
  try {
    const [settings, kpis] = await Promise.all([
      getSystemSettings(),
      getGlobalKPIs(),
    ]);

    return NextResponse.json({
      settings,
      kpis,
      diagnostics: {
        supabaseConfigured: isSupabaseConfigured(),
        emailCredentialsConfigured: hasLiveEmailCredentials(settings),
        googleClientIdSet: Boolean(process.env.GOOGLE_CLIENT_ID),
        googleClientSecretSet: Boolean(process.env.GOOGLE_CLIENT_SECRET),
        gmailRefreshTokenSet: Boolean(
          settings.gmail_refresh_token || process.env.GMAIL_REFRESH_TOKEN
        ),
        resendApiKeySet: Boolean(process.env.RESEND_API_KEY),
        cronSecretSet: Boolean(process.env.CRON_SECRET),
        adminPasscodeSet: Boolean(process.env.ADMIN_PASSCODE),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const updated = await updateSystemSettings({
      send_provider: body.send_provider,
      execution_mode: body.execution_mode,
      daily_send_limit:
        body.daily_send_limit !== undefined ? Number(body.daily_send_limit) : undefined,
      min_delay_minutes:
        body.min_delay_minutes !== undefined ? Number(body.min_delay_minutes) : undefined,
      max_delay_minutes:
        body.max_delay_minutes !== undefined ? Number(body.max_delay_minutes) : undefined,
      sender_name: body.sender_name,
      sender_email: body.sender_email,
      portfolio_base_url: body.portfolio_base_url,
      resume_url: body.resume_url,
      gmail_refresh_token: body.gmail_refresh_token,
    });

    const kpis = await getGlobalKPIs();
    return NextResponse.json({ settings: updated, kpis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update settings';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
