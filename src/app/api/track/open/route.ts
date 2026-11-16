import { after, type NextRequest } from "next/server";
import { recordEngagement } from "@/lib/server/engagement";

export const dynamic = "force-dynamic";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function pixel(): Response {
  return new Response(new Uint8Array(GIF), {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(GIF.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

/** GET /api/track/open?l={lead}&e={emailLog} — 1x1 transparent GIF, never cached. */
export async function GET(req: NextRequest) {
  const lead = req.nextUrl.searchParams.get("l") ?? "";
  const log = req.nextUrl.searchParams.get("e");
  const ua = req.headers.get("user-agent") ?? "";

  after(async () => {
    try {
      await recordEngagement(lead, "open", {
        logId: log,
        userAgent: ua,
        metadata: { ua: ua.slice(0, 300), proxy: /GoogleImageProxy|YahooMailProxy|Outlook/i.test(ua) },
      });
    } catch (e) {
      console.error("[track/open]", e);
    }
  });

  return pixel();
}

/** Link checkers probe with HEAD — answer without counting an open. */
export function HEAD() {
  return pixel();
}
