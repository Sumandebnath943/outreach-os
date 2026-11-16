"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const REFRESH_EVENT = "oos:refresh";
export function broadcastRefresh() {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/** Fetches `url`, re-polls every `intervalMs` and on the global refresh event. */
export function usePoll<T>(url: string | null, intervalMs = 20000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const urlRef = useRef(url);
  urlRef.current = url;

  const reload = useCallback(async () => {
    if (!urlRef.current) return;
    try {
      const d = await api<T>(urlRef.current);
      setData(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    if (!url) return;
    const id = intervalMs > 0 ? setInterval(() => document.visibilityState === "visible" && reload(), intervalMs) : null;
    const onRefresh = () => reload();
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => {
      if (id) clearInterval(id);
      window.removeEventListener(REFRESH_EVENT, onRefresh);
    };
  }, [url, intervalMs, reload]);

  return { data, error, loading, reload, setData };
}
