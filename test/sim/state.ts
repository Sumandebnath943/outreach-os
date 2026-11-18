/** Shared handles the module mocks in simulation.test.ts delegate to (swapped per scenario). */
import type { FakeGmail } from "./fake-gmail";
import type { FakeSupabase } from "./fake-supabase";

export const state = {
  db: null as unknown as FakeSupabase,
  gmail: null as unknown as FakeGmail,
  /** Callbacks passed to next/server `after()` — flushed explicitly by the harness. */
  after: [] as (() => unknown)[],
  /** Telegram messages the app tried to send (captured, never sent). */
  telegram: [] as string[],
  /** Fake Groq: returns the model's JSON text for a reply, or null to simulate an API error. */
  groq: null as ((replyText: string) => string | null) | null,
  groqCalls: 0,
};
