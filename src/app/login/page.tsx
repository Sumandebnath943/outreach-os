'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cpu, Lock } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        setError('Invalid ADMIN_PASSCODE');
        return;
      }
      router.push('/');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090B] p-4">
      <div className="w-full max-w-sm rounded-lg border border-[#27272A] bg-[#121215] p-6 shadow-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded border border-[#27272A] bg-[#09090B] text-emerald-400">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <h1 className="font-mono text-sm font-bold tracking-widest text-[#FAFAFA]">
              OUTREACH-OS
            </h1>
            <p className="font-mono text-[10px] text-zinc-500">
              SUMAN DEBNATH // COMMAND AUTH
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 p-2.5 font-mono text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
              Enter Operator Passcode (`ADMIN_PASSCODE`)
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="password"
                required
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded border border-[#27272A] bg-[#09090B] pl-9 pr-3 py-2 font-mono text-xs text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-emerald-500 py-2 text-xs font-bold uppercase tracking-wider text-[#09090B] hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Unlock Command Console'}
          </button>
        </form>
      </div>
    </div>
  );
}
