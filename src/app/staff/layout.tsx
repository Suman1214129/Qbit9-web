import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { env } from "@/lib/env";

/** Staff screens are for branch staff only: keep them out of search results and off when disabled. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: ReactNode }) {
  if (!env.staffApp) notFound();
  return children;
}
