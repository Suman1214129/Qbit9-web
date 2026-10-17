"use client";
import { Icon } from "@/components/ui";
import { useOnline } from "@/hooks/use-online";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-[calc(76px+var(--safe-bottom))] z-50 mx-auto flex w-[calc(100%-32px)] max-w-[420px] items-center gap-2.5 rounded-2xl bg-ink px-4 py-3 text-sm text-on-primary shadow-pop lg:bottom-6">
      <Icon name="wifi-off" size={18} />
      <span>You are offline. Your place is safe, updates resume when you are back.</span>
    </div>
  );
}
