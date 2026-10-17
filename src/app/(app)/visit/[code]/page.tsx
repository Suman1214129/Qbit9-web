import { VisitComplete } from "@/features/token/visit-complete";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <VisitComplete code={decodeURIComponent(code)} />;
}
