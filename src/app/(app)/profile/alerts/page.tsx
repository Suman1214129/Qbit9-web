import type { Metadata } from "next";
import { AlertsScreen } from "@/features/profile/alerts-screen";

export const metadata: Metadata = { title: "Alerts" };

export default function Page() {
  return <AlertsScreen />;
}
