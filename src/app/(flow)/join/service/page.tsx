import type { Metadata } from "next";
import { ServicePicker } from "@/features/join/service-picker";

export const metadata: Metadata = { title: "Choose a service" };

export default function Page() {
  return <ServicePicker />;
}
