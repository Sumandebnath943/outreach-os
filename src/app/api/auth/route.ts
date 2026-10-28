import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'outreach_os_session';

export async function GET(req: NextRequest) {
  const expectedPasscode = process.env.ADMIN_PASSCODE;
  if (!expectedPasscode) {
    return NextResponse.json({ authenticated: true, passcodeRequired: false });
  }
  const cookieVal = req.cookies.get(COOKIE_NAME)?.value;
  return NextResponse.json({
    authenticated: cookieVal === expectedPasscode,
    passcodeRequired: true,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { passcode } = await req.json();
    const expectedPasscode = process.env.ADMIN_PASSCODE;

    if (!expectedPasscode || passcode === expectedPasscode) {
      const res = NextResponse.json({ authenticated: true });
      res.cookies.set(COOKIE_NAME, expectedPasscode || 'local_dev_ok', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return res;
    }

    return NextResponse.json(
      { error: 'Invalid ADMIN_PASSCODE' },
      { status: 401 }
    );
  } catch {
    return NextResponse.json({ error: 'Authentication error' }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ authenticated: false });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
