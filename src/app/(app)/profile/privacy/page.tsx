import type { Metadata } from "next";
import { PrivacyScreen } from "@/features/profile/privacy-screen";

export const metadata: Metadata = { title: "Privacy and consent" };

export default function Page() {
  return <PrivacyScreen />;
}
