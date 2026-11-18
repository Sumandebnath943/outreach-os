"use client";

import { useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";

export function SignInForm({ next, configured }: { next: string; configured: boolean }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, next }),
      });
      const json = (await res.json().catch(() => ({}))) as { next?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Sign-in failed (${res.status})`);
      window.location.assign(json.next ?? "/pipeline");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const field =
    "h-10 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg placeholder:text-dim focus:border-accent focus:outline-none";
  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Sign in">
      <div>
        <label htmlFor="username" className="mb-1.5 block text-[11px] font-medium tracking-wider text-muted uppercase">
          Username
        </label>
        <input id="username" name="username" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-[11px] font-medium tracking-wider text-muted uppercase">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !configured}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
        Sign in
      </button>
      {!configured && <p className="text-xs text-warning">Sign-in is unavailable. Contact the workspace owner.</p>}
    </form>
  );
}
