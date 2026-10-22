import type { Metadata } from "next";
import { WalkInScreen } from "@/features/staff/walk-in-screen";

export const metadata: Metadata = { title: "Walk-in" };

export default function Page() {
  return <WalkInScreen />;
}
