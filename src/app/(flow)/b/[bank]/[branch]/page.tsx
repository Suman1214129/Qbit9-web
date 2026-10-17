import { BranchLanding } from "@/features/join/branch-landing";

export default async function Page({ params }: { params: Promise<{ bank: string; branch: string }> }) {
  const { bank, branch } = await params;
  return <BranchLanding bank={bank} slug={branch} />;
}
