"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

type Tone = "info" | "success" | "warn";
interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone: Tone;
  icon?: IconName;
}
interface ToastApi {
  show: (t: Omit<ToastItem, "id" | "tone"> & { tone?: Tone; ms?: number }) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback<ToastApi["show"]>(({ ms = 4500, tone = "info", ...t }) => {
    const id = nextId.current++;
    setItems((cur) => [...cur.slice(-2), { id, tone, ...t }]);
    window.setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), ms);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 top-[calc(12px+var(--safe-top))] z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-[380px] animate-pop-in items-start gap-3 rounded-[18px] px-4 py-3 shadow-pop",
              t.tone === "success" ? "bg-deep text-on-primary" : t.tone === "warn" ? "bg-peach text-ink" : "bg-ink text-on-primary",
            )}
          >
            <Icon name={t.icon ?? (t.tone === "warn" ? "warn" : t.tone === "success" ? "check" : "bell")} size={18} className="mt-0.5 shrink-0" />
            <div className="text-sm leading-snug">
              <b className="block font-semibold">{t.title}</b>
              {t.body ? <span className="opacity-80">{t.body}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used inside <ToastProvider>");
  return v;
}
