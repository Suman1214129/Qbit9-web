import type { Metadata } from "next";
import { LocationCheck } from "@/features/join/location-check";

export const metadata: Metadata = { title: "Location check" };

export default async function Page({ params }: { params: Promise<{ bank: string; branch: string }> }) {
  const { bank, branch } = await params;
  return <LocationCheck bank={bank} slug={branch} />;
}
