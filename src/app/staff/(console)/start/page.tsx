import type { Metadata } from "next";
import { StartScreen } from "@/features/staff/start-screen";

export const metadata: Metadata = { title: "Start shift" };

export default function Page() {
  return <StartScreen />;
}
