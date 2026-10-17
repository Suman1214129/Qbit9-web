import type { Metadata } from "next";
import { PriorityScreen } from "@/features/profile/priority-screen";

export const metadata: Metadata = { title: "Priority" };

export default function Page() {
  return <PriorityScreen />;
}
