import Image from "next/image";
import { cn } from "@/lib/cn";

/** Illustration for branch landing and onboarding screens in customer and staff views. */
export function BranchArt({ className }: { tag?: string; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden bg-transparent shadow-none",
        className
      )}
    >
      <Image
        src="/Online Banking illustration 4 (1) 1.png"
        alt="Online Banking illustration"
        fill
        sizes="(max-width: 768px) 100vw, 480px"
        className="object-contain"
        priority
      />
    </div>
  );
}
