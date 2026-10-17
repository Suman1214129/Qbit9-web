"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createServices } from "@/services/registry";
import type { Services } from "@/services/types";

const Ctx = createContext<Services | null>(null);

/** Creates the adapter once per browser tab and hands it to every hook. Swap adapters in services/registry.ts. */
export function ServicesProvider({ children }: { children: ReactNode }) {
  const [services] = useState<Services>(() => createServices());
  return <Ctx.Provider value={services}>{children}</Ctx.Provider>;
}

export function useServices(): Services {
  const v = useContext(Ctx);
  if (!v) throw new Error("useServices must be used inside <ServicesProvider>");
  return v;
}
