import "server-only";
import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
export class InputError extends Error {}

/** Wraps a route handler so thrown errors become JSON 500s instead of HTML pages. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      let message = e instanceof Error ? e.message : String(e);
      if (/deleted_at|import_batches|suppressed_addresses|last_reply_checked_at|is_test|import_batch_id/.test(message) && /does not exist|schema cache|could not find/i.test(message)) message = "Database upgrade required: run supabase/migrations/013_lead_management.sql before using this version.";
      console.error("[api]", message, e);
      return fail(message, e instanceof InputError ? 400 : 500);
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
