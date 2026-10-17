import type { Metadata } from "next";
import { SavedBranchesScreen } from "@/features/profile/saved-branches-screen";

export const metadata: Metadata = { title: "Saved branches" };

export default function Page() {
  return <SavedBranchesScreen />;
}
