import { TokenScreen } from "@/features/token/token-screen";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <TokenScreen code={decodeURIComponent(code)} />;
}
