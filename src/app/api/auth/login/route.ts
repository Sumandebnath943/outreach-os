import { NextResponse } from "next/server";
import { createSessionToken, safeEqual, safeNext, SESSION_COOKIE, SESSION_DAYS, sessionKey } from "@/lib/session";
import { readJson, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST /api/auth/login { username, password, next? } → sets the signed session cookie. */
export const POST = route(async (req: Request) => {
  const body = await readJson<{ username?: unknown; password?: unknown; next?: unknown }>(req);
  const password = process.env.DASHBOARD_PASSWORD;
  const user = process.env.DASHBOARD_USER || "admin";
  const next = safeNext(typeof body.next === "string" ? body.next : null);

  if (!password) {
    if (process.env.NODE_ENV !== "production") return NextResponse.json({ ok: true, next }); // local dev is open
    return NextResponse.json({ error: "Sign-in is not configured: set DASHBOARD_PASSWORD." }, { status: 503 });
  }

  const ok = safeEqual(String(body.username ?? "").trim(), user) && safeEqual(String(body.password ?? ""), password);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 700)); // slows down guessing
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }

  const key = sessionKey({ password, sessionSecret: process.env.SESSION_SECRET, cronSecret: process.env.CRON_SECRET })!;
  const res = NextResponse.json({ ok: true, next });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(user, key), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return res;
});
