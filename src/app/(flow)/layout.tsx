import { Suspense, type ReactNode } from "react";

export default function FlowLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>{children}</Suspense>;
}
