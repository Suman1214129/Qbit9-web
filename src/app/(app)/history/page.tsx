import type { Metadata } from "next";
import { HistoryScreen } from "@/features/history/history-screen";

export const metadata: Metadata = { title: "Your visits" };

export default function Page() {
  return <HistoryScreen />;
}
