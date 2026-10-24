"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function getBankLogo(key?: string | null): string | null {
  if (!key) return null;
  const k = key.toLowerCase().trim();
  if (k === "sbi" || k.includes("state bank") || k === "bank_sbi") {
    return "/SBI-logo.svg.webp";
  }
  if (k === "bob" || k.includes("baroda") || k === "bank_bob") {
    return "/Bank-of-Baroda-icon.png";
  }
  if (k === "boi" || k.includes("bank of india") || k === "bank_boi") {
    return "/Bank-of-India-logo.png";
  }
  return null;
}

export function Avatar({ initial, size = 36, className }: { initial: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-rose font-semibold text-deep", className)}
    >
      {initial}
    </span>
  );
}

export function Monogram({
  text,
  size = 46,
  className,
  bankSlug,
}: {
  text: string;
  size?: number;
  className?: string;
  bankSlug?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const logo = !imgError ? getBankLogo(bankSlug || text) : null;

  if (logo) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-[0_1px_3px_rgba(0,0,0,0.08),inset_0_0_0_1px_rgba(0,0,0,0.08)]",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt={text}
          onError={() => setImgError(true)}
          className="size-full object-contain"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.32) }}
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary font-bold text-on-primary", className)}
    >
      {text}
    </span>
  );
}
