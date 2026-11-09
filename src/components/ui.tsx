"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100",
        size === "sm" && "px-3 py-1.5 text-sm",
        size === "md" && "px-4 py-2.5 text-[15px]",
        size === "lg" && "px-5 py-3.5 text-base",
        variant === "primary" && "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
        variant === "secondary" && "bg-white text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50",
        variant === "ghost" && "text-brand-700 hover:bg-brand-50",
        variant === "danger" && "bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50",
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className ?? "size-5")} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Avatar (Farbe aus dem Namen)
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  "bg-sky-100 text-sky-800",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-lime-100 text-lime-800",
  "bg-orange-100 text-orange-800",
  "bg-teal-100 text-teal-800",
  "bg-fuchsia-100 text-fuchsia-800",
  "bg-indigo-100 text-indigo-800",
];

export function colorFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs",
        colorFor(name),
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function AiAvatar({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-sky-400 text-white",
        size === "sm" ? "size-6 text-[11px]" : "size-8 text-sm",
      )}
      aria-hidden
    >
      ✦
    </span>
  );
}

// ---------------------------------------------------------------------------
// Bottom Sheet
// ---------------------------------------------------------------------------

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal>
      <div className="animate-fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="animate-sheet-up pb-safe relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-200 sm:hidden" />
        {title && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold leading-tight">{title}</h2>
            <button onClick={onClose} className="-m-1 rounded-full p-1 text-zinc-400 hover:bg-zinc-100" aria-label="Schließen">
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper (+/-) mit Bruchteilen
// ---------------------------------------------------------------------------

export function Stepper({
  value,
  onChange,
  max,
  step = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  step?: number;
  label?: string;
}) {
  const dec = () => onChange(Math.max(0, Math.round((value - step) * 1000) / 1000));
  const inc = () => onChange(Math.round((value + step) * 1000) / 1000);
  return (
    <div className="inline-flex items-center rounded-xl bg-zinc-100 p-0.5" aria-label={label}>
      <button
        type="button"
        onClick={dec}
        disabled={value <= 0}
        className="flex size-9 items-center justify-center rounded-lg text-xl text-zinc-700 hover:bg-white disabled:opacity-30"
        aria-label="weniger"
      >
        −
      </button>
      <span className="min-w-9 text-center font-semibold tabular-nums">{fmtQty(value)}</span>
      <button
        type="button"
        onClick={inc}
        disabled={max !== undefined && value + step > max + 1e-6}
        className="flex size-9 items-center justify-center rounded-lg text-xl text-zinc-700 hover:bg-white disabled:opacity-30"
        aria-label="mehr"
      >
        +
      </button>
    </div>
  );
}

function fmtQty(q: number) {
  if (Math.abs(q - Math.round(q)) < 1e-6) return String(Math.round(q));
  if (Math.abs(q % 1 - 0.5) < 1e-6) return `${Math.floor(q) || ""}½`;
  return q.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type Toast = { id: number; text: string; kind: "error" | "info" };
const ToastCtx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "animate-fade-in pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm shadow-lg",
              t.kind === "error" ? "bg-red-600 text-white" : "bg-zinc-900 text-white",
            )}
            role="status"
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

// ---------------------------------------------------------------------------
// Diverses
// ---------------------------------------------------------------------------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100", className)}>{children}</div>;
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className ?? "bg-zinc-100 text-zinc-700")}>
      {children}
    </span>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-xl border-0 bg-white px-4 py-3 ring-1 ring-zinc-200 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-500",
        props.className,
      )}
    />
  );
}
