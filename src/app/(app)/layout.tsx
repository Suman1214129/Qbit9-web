import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/layout";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<div className="min-h-[60dvh]" aria-busy="true" />}>{children}</Suspense>
    </AppShell>
  );
}
