import type { Metadata } from "next";
import { CounterScreen } from "@/features/staff/counter-screen";

export const metadata: Metadata = { title: "Counter" };

export default function Page() {
  return <CounterScreen />;
}
