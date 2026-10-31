"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand";
import { Spinner } from "@/components/ui";
import { useActiveToken, useSession } from "@/hooks/queries";

/** Entry point: active token goes to waiting screen, signed in goes home, everyone else picks a branch. */
export function RootRedirect() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { data: activeToken, isPending: tokenPending } = useActiveToken(!!session);

  useEffect(() => {
    if (isPending || (session && tokenPending)) return;
    if (session) {
      if (activeToken && (activeToken.stage === "waiting" || activeToken.stage === "checkin" || activeToken.stage === "called" || activeToken.stage === "serving")) {
        router.replace(`/token/${activeToken.code}`);
      } else {
        router.replace("/home");
      }
    } else {
      router.replace("/branches");
    }
  }, [isPending, session, activeToken, tokenPending, router]);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <Logo />
      <Spinner />
    </div>
  );
}
