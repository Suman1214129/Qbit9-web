"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Hide the visible title but keep it for screen readers. */
  hideTitle?: boolean;
  children: ReactNode;
  /** "sheet" slides up on phones and centres on desktop. "dialog" is centred everywhere. */
  variant?: "sheet" | "dialog";
  dismissible?: boolean;
}

/**
 * Modal built on the native <dialog>: real focus trapping, Escape to close, inert background.
 */
export function Sheet({ open, onClose, title, hideTitle, children, variant = "sheet", dismissible = true }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    }
    if (!open && d.open) d.close();
    if (!open) document.documentElement.style.overflow = "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto bg-surface p-0 text-ink backdrop:bg-ink/40 backdrop:animate-fade-in",
        variant === "sheet"
          ? "fixed inset-x-0 top-auto bottom-0 rounded-t-sheet shadow-sheet animate-sheet-in md:inset-auto md:top-1/2 md:left-1/2 md:max-w-[440px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-sheet"
          : "fixed top-1/2 left-1/2 max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[22px] bg-white shadow-pop animate-pop-in w-[calc(100%-36px)]",
      )}
    >
      {open ? (
        <div className={cn(variant === "sheet" ? "px-[18px] pt-2.5 pb-[calc(32px+var(--safe-bottom))] md:px-7 md:pt-7" : "p-[18px]")}>
          {variant === "sheet" ? <div className="mx-auto mb-3 h-1 w-[34px] rounded bg-ink/15 md:hidden" aria-hidden="true" /> : null}
          <h2 className={cn(variant === "sheet" ? "text-[23px] leading-[1.1] font-semibold tracking-[-.6px]" : "text-[15.5px] leading-tight font-semibold", hideTitle && "sr-only")}>{title}</h2>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
