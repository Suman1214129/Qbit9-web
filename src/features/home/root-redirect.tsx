"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand";
import { Spinner } from "@/components/ui";
import { useSession } from "@/hooks/queries";

/** Entry point: signed in goes home, everyone else picks a branch. */
export function RootRedirect() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  useEffect(() => {
    if (!isPending) router.replace(session ? "/home" : "/branches");
  }, [isPending, session, router]);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <Logo />
      <Spinner />
    </div>
  );
}
