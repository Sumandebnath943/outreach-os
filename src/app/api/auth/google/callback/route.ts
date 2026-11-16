import { NextResponse, type NextRequest } from "next/server";
import { gmail as gmailApi } from "@googleapis/gmail";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { oauthClient } from "@/lib/server/gmail";

export const dynamic = "force-dynamic";

/** GET /api/auth/google/callback — stores the Gmail refresh token in system_settings. */
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(`${env.appBaseUrl()}/settings?${q}`);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get("oos_oauth_state")?.value;
  if (req.nextUrl.searchParams.get("error")) return back(`gmail=denied`);
  if (!code || !state || state !== expected) return back("gmail=state_mismatch");

  try {
    const client = oauthClient(`${env.appBaseUrl()}/api/auth/google/callback`);
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) return back("gmail=no_refresh_token");
    client.setCredentials(tokens);
    const profile = await gmailApi({ version: "v1", auth: client }).users.getProfile({ userId: "me" });
    const patch: Record<string, unknown> = { gmail_refresh_token: tokens.refresh_token };
    if (profile.data.emailAddress) patch.sender_email = profile.data.emailAddress.toLowerCase();
    const { error } = await db().from("system_settings").update(patch).eq("id", 1);
    if (error) throw new Error(error.message);
    const res = back("gmail=connected");
    res.cookies.delete("oos_oauth_state");
    return res;
  } catch (e) {
    console.error("[gmail oauth]", e);
    return back(`gmail=error&reason=${encodeURIComponent((e as Error).message).slice(0, 200)}`);
  }
}
