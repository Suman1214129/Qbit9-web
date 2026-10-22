import type { Metadata } from "next";
import { QueueScreen } from "@/features/staff/queue-screen";

export const metadata: Metadata = { title: "Queue" };

export default function Page() {
  return <QueueScreen />;
}
