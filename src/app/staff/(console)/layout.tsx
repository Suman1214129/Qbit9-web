import type { ReactNode } from "react";
import { Suspense } from "react";
import { StaffShell } from "@/features/staff/staff-shell";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <StaffShell>{children}</StaffShell>
    </Suspense>
  );
}
