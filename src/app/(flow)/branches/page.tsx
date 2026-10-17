import type { Metadata } from "next";
import { BranchPicker } from "@/features/branch/branch-picker";

export const metadata: Metadata = { title: "Find your branch" };

export default function Page() {
  return <BranchPicker />;
}
