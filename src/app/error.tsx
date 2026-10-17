"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-[28px] font-semibold tracking-[-.8px]">Something went wrong</h1>
      <p className="text-sm text-muted">Your place in any queue is safe. Try again, or go back home.</p>
      <Button onClick={reset}>Try again</Button>
      <Button href="/" variant="outline">Go home</Button>
    </main>
  );
}
