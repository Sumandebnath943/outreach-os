import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'outreach_os_session';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Public telemetry & cron endpoints must ALWAYS remain accessible without UI session cookies
  if (
    pathname.startsWith('/api/track/') ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. If ADMIN_PASSCODE is configured in env, enforce cookie session on dashboard & admin APIs
  const expectedPasscode = process.env.ADMIN_PASSCODE;
  if (!expectedPasscode) {
    return NextResponse.next();
  }

  const sessionCookie = req.cookies.get(COOKIE_NAME)?.value;
  const isAuthenticated = sessionCookie === expectedPasscode;

  if (pathname === '/login') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized — ADMIN_PASSCODE required' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
