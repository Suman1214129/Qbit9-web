"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { isDomainError } from "@/domain";
import { ToastProvider } from "@/components/ui";
import { AlertsWatcher } from "@/features/alerts/alerts-watcher";
import { ServiceWorkerRegister } from "@/features/pwa/sw-register";
import { OfflineBanner } from "@/features/pwa/offline-banner";
import { QueueSync } from "./queue-sync";
import { ServicesProvider } from "./services-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, error) => !isDomainError(error) && count < 2,
            refetchOnWindowFocus: true,
            staleTime: 10_000,
          },
        },
      }),
  );
  return (
    <ServicesProvider>
      <QueryClientProvider client={client}>
        <ToastProvider>
          {children}
          <QueueSync />
          <AlertsWatcher />
          <OfflineBanner />
          <ServiceWorkerRegister />
        </ToastProvider>
      </QueryClientProvider>
    </ServicesProvider>
  );
}
