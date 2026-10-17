import type { Metadata } from "next";
import { ReviewJoin } from "@/features/join/review-join";

export const metadata: Metadata = { title: "Review and join" };

export default function Page() {
  return <ReviewJoin />;
}
