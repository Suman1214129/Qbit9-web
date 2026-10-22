import type { Metadata } from "next";
import { TodayScreen } from "@/features/staff/today-screen";

export const metadata: Metadata = { title: "Today" };

export default function Page() {
  return <TodayScreen />;
}
