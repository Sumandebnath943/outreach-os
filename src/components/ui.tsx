"use client";

import { Loader2, X } from "lucide-react";
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline" | "danger" | "success";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }
>(function Button({ variant = "outline", size = "md", loading, className, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap transition-colors select-none",
        "disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        variant === "primary" && "border-blue-700 bg-blue-700 text-white hover:bg-blue-800",
        variant === "outline" && "border-line bg-card text-fg hover:border-line-strong hover:bg-raised",
        variant === "ghost" && "border-transparent text-muted hover:bg-raised hover:text-fg",
        variant === "danger" && "border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20",
        variant === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20",
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
});

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border border-line bg-card", className)}>{children}</div>;
}

export function Badge({
  tone = "neutral",
  className,
  children,
  title,
}: {
  tone?: "neutral" | "emerald" | "amber" | "rose" | "sky" | "violet";
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] leading-4 tracking-wide",
        tone === "neutral" && "border-line text-muted",
        tone === "emerald" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
        tone === "amber" && "border-amber-500/30 bg-amber-500/10 text-amber-700",
        tone === "rose" && "border-rose-500/30 bg-rose-500/10 text-rose-700",
        tone === "sky" && "border-sky-500/30 bg-sky-500/10 text-sky-700",
        tone === "violet" && "border-violet-500/30 bg-violet-500/10 text-violet-700",
        className,
      )}
    >
      {children}
    </span>
  );
}

const fieldCls =
  "w-full rounded-md border border-line bg-bg px-3 text-sm text-fg placeholder:text-dim focus:border-zinc-500 focus:outline-none";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(fieldCls, "h-9", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(fieldCls, "py-2 leading-relaxed", className)} {...props} />;
});

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldCls, "h-9 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-[11px] font-medium tracking-wider text-muted uppercase">{children}</span>
      {hint && <span className="text-[11px] text-dim">{hint}</span>}
    </div>
  );
}

export function Metric({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] font-medium tracking-[0.12em] text-dim uppercase">{label}</div>
      <div className={cn("font-mono text-lg leading-6 tabular", tone)}>
        {value}
        {sub && <span className="ml-0.5 text-xs text-dim">{sub}</span>}
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-16 text-center">
      <div className="text-sm text-fg">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-dim">{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[10vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className={cn("w-full rounded-lg border border-line bg-card shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="text-sm font-medium">{title}</div>
          <button onClick={onClose} className="text-dim hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── toasts ──────────────────────────────────────────────
type Toast = { id: number; msg: string; tone: "ok" | "err" | "info" };
const TOAST_EVENT = "oos:toast";

export function toast(msg: string, tone: Toast["tone"] = "ok") {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { msg, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const { msg, tone } = (e as CustomEvent).detail as Omit<Toast, "id">;
      const id = ++n;
      setItems((xs) => [...xs, { id, msg, tone }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === "err" ? 7000 : 3500);
    };
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, []);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "animate-slide-in pointer-events-auto rounded-md border bg-card px-3 py-2 text-sm shadow-xl",
            t.tone === "ok" && "border-emerald-500/30 text-emerald-700",
            t.tone === "err" && "border-rose-500/30 text-rose-700",
            t.tone === "info" && "border-line text-fg",
          )}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
