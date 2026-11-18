# Portfolio Telemetry Snippet (optional)

This optional client component reports page views and time-on-page back to OutreachOS, so they show in each lead's dossier.
Your portfolio's own visitor alerts already work without it: every tracked link carries a readable `ref` label and UTM
parameters (see the README).

1. Save it as `components/PortfolioTracker.tsx`. Replace `https://YOUR-OUTREACH-OS.vercel.app` with your OutreachOS URL.
   Settings → *Portfolio telemetry snippet* shows a copy with the URL already filled in.
2. Mount it once inside the root `app/layout.tsx` body: `<PortfolioTracker />`.
3. Make sure the portfolio origin, and its `www.` variant if you serve one, is listed in OutreachOS `PORTFOLIO_ALLOWED_ORIGINS`.

**How it works:**
- Every tracked email link carries the lead ID as `?oid=<lead id>`. Older emails used `?ref=<lead id>`; both are accepted.
- The component stores that ID, then sends a `view` beacon on each route change. That counts the page and promotes the lead to WARM_ENGAGED.
- When the tab is hidden, the route changes or the page unloads, it sends a `leave` beacon with the cumulative visible time.
- Beacons use `text/plain`, so no CORS preflight is needed.
- Visitors without a lead ID are never tracked.

> Testing tip: clicking your own tracked link stores that lead's ID in your browser. Clear the `oos_ref` key from
> localStorage afterwards, or test in a private window.

```tsx
"use client";
// components/PortfolioTracker.tsx — mount once in app/layout.tsx:  <PortfolioTracker />
// Reports recruiter page views back to OutreachOS when the visit came from a tracked email (?ref=<lead uuid>).
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const ENDPOINT = "https://YOUR-OUTREACH-OS.vercel.app/api/track/portfolio";
const KEY = "oos_ref";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function send(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  // text/plain keeps sendBeacon a "simple" CORS request (no preflight)
  if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
  fetch(ENDPOINT, { method: "POST", body, keepalive: true, mode: "cors", headers: { "Content-Type": "text/plain" } }).catch(() => {});
}

function Tracker() {
  const pathname = usePathname();
  const params = useSearchParams();

  // Persist the OutreachOS lead ID (?oid=, or ?ref= on older emails) so later pages and
  // return visits are attributed to the same recruiter
  useEffect(() => {
    const id = [params.get("oid"), params.get("ref")].find((v) => v && UUID.test(v));
    if (id) {
      try { sessionStorage.setItem(KEY, id); localStorage.setItem(KEY, id); } catch {}
    }
  }, [params]);

  useEffect(() => {
    let ref: string | null = null;
    try { ref = sessionStorage.getItem(KEY) || localStorage.getItem(KEY); } catch {}
    if (!ref) return;

    const path = pathname;
    let visibleMs = 0;
    let since: number | null = document.visibilityState === "visible" ? Date.now() : null;
    const pause = () => { if (since !== null) { visibleMs += Date.now() - since; since = null; } };
    // durationSec is cumulative visible time; the server keeps the largest value reported
    const report = () => send({ ref, path, type: "leave", durationSec: Math.round(visibleMs / 1000) });

    send({ ref, path, type: "view", title: document.title, referrer: document.referrer });

    const onVisibility = () => {
      if (document.visibilityState === "hidden") { pause(); report(); } // the tab may never come back
      else if (since === null) since = Date.now();
    };
    const onPageHide = () => { pause(); report(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      pause();
      report(); // route change
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [pathname]);

  return null;
}

// useSearchParams needs a Suspense boundary in the App Router
export default function PortfolioTracker() {
  return (
    <Suspense fallback={null}>
      <Tracker />
    </Suspense>
  );
}
```
