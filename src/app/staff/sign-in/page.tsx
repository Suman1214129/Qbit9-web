import type { Metadata } from "next";
import { Suspense } from "react";
import { StaffSignInScreen } from "@/features/staff/sign-in-screen";

export const metadata: Metadata = { title: "Staff sign in" };

export default function Page() {
  return (
    <Suspense>
      <StaffSignInScreen />
    </Suspense>
  );
}
