import { ok, route } from "@/lib/server/http";
import { processQueue } from "@/lib/server/sequencer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/queue/run — dashboard "Sync Replies & Run Queue" (protected by the dashboard auth middleware). */
export const POST = route(async () => ok(await processQueue("manual")));
