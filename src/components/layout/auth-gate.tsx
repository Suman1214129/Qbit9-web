"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Skeleton } from "@/components/ui";
import { useSession } from "@/hooks/queries";
import { clearLeaving, isLeaving } from "@/lib/leaving";

/** Renders children only for a signed-in customer; otherwise sends them to sign in and back again. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (session) clearLeaving();
    else if (!isPending && !isLeaving()) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [isPending, session, router, pathname]);

  if (isPending || !session) {
    return (
      <div className="flex flex-col gap-4 px-[18px] pt-6" aria-busy="true">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  return <>{children}</>;
}
