import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — clears the session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  // Same attributes as the login cookie, so every browser treats this as the same cookie and drops it.
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
