import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/server/env";
import { GMAIL_SCOPES, oauthClient } from "@/lib/server/gmail";

export const dynamic = "force-dynamic";

/** GET /api/auth/google/start — begins the Gmail OAuth consent flow (offline access → refresh token). */
export async function GET() {
  if (!env.googleClientId() || !env.googleClientSecret()) {
    return NextResponse.json({ error: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first" }, { status: 400 });
  }
  const state = randomBytes(16).toString("hex");
  const url = oauthClient(`${env.appBaseUrl()}/api/auth/google/callback`).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state,
  });
  const res = NextResponse.redirect(url);
  res.cookies.set("oos_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 600, path: "/" });
  return res;
}
