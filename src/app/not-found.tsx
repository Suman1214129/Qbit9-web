import { Logo } from "@/components/brand";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <h1 className="text-[28px] font-semibold tracking-[-.8px]">We could not find that page</h1>
      <p className="text-sm text-muted">The link may be old. Start from your branch or your home screen.</p>
      <Button href="/">Go to QBIT9</Button>
    </main>
  );
}
