import type { Metadata } from "next";
import { VerifyForm } from "@/features/auth/verify-form";

export const metadata: Metadata = { title: "Verify" };

export default function Page() {
  return <VerifyForm />;
}
