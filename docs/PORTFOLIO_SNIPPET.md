# Portfolio Telemetry Integration (`sumandebnath.houseofnamus.com`)

Mount the `<PortfolioTracker />` client component inside your portfolio repository (`sumandebnath.houseofnamus.com`) to stream real-time recruiter browse sessions, exact pages visited (`/agents/migi`, `/projects/roasmind`, `/resume`), and dwell duration back to **OutreachOS**.

## 1. Create `components/PortfolioTracker.tsx` in your Portfolio Repo

```tsx
'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const OUTREACH_OS_WEBHOOK =
  process.env.NEXT_PUBLIC_OUTREACH_OS_URL
    ? `${process.env.NEXT_PUBLIC_OUTREACH_OS_URL.replace(/\/+$/, '')}/api/track/portfolio`
    : 'https://your-outreach-os-domain.vercel.app/api/track/portfolio';

function PortfolioTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const enteredAtRef = useRef<number>(Date.now());

  useEffect(() => {
    // 1. Capture ?ref={{lead_uuid}} from incoming cold email link & persist in sessionStorage
    const urlRef = searchParams?.get('ref');
    if (urlRef) {
      sessionStorage.setItem('outreach_os_ref', urlRef);
    }

    const activeRef = urlRef || sessionStorage.getItem('outreach_os_ref');
    if (!activeRef) return;

    enteredAtRef.current = Date.now();

    // 2. Fire immediate pageview beacon
    fetch(OUTREACH_OS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: activeRef,
        path: pathname || '/',
        durationSec: 5,
        referrer: document.referrer || null,
      }),
      keepalive: true,
    }).catch(() => {});

    // 3. Log exact dwell duration when recruiter navigates away or closes tab
    const sendDwellDuration = () => {
      const durationSec = Math.round((Date.now() - enteredAtRef.current) / 1000);
      if (durationSec < 2) return;
      const payload = JSON.stringify({
        ref: activeRef,
        path: pathname || '/',
        durationSec,
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(OUTREACH_OS_WEBHOOK, payload);
      }
    };

    window.addEventListener('pagehide', sendDwellDuration);
    return () => {
      sendDwellDuration();
      window.removeEventListener('pagehide', sendDwellDuration);
    };
  }, [pathname, searchParams]);

  return null;
}

export function PortfolioTracker() {
  return (
    <Suspense fallback={null}>
      <PortfolioTrackerInner />
    </Suspense>
  );
}
```

## 2. Mount inside `app/layout.tsx`

```tsx
import { PortfolioTracker } from '@/components/PortfolioTracker';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PortfolioTracker />
        {children}
      </body>
    </html>
  );
}
```
