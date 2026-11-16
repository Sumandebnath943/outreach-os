/** Copy-paste client component for the portfolio site (shown in Settings and docs/PORTFOLIO_SNIPPET.md). */
export function portfolioSnippet(endpointBase: string): string {
  return `"use client";
// components/PortfolioTracker.tsx — mount once in app/layout.tsx:  <PortfolioTracker />
// Reports recruiter page views back to OutreachOS when the visit came from a tracked email (?ref=<lead uuid>).
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const ENDPOINT = "${endpointBase.replace(/\/$/, "")}/api/track/portfolio";
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

  // Persist ?ref= so later pages and return visits are attributed to the same recruiter
  useEffect(() => {
    const ref = params.get("ref");
    if (ref && UUID.test(ref)) {
      try { sessionStorage.setItem(KEY, ref); localStorage.setItem(KEY, ref); } catch {}
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
`;
}
