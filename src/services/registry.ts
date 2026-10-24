import { env } from "@/lib/env";
import type { Services } from "./types";
import { createMockServices } from "./mock";
import { createSupabaseServices } from "./supabase";

/**
 * The only place an adapter is chosen. Everything else receives `Services` from context.
 * To go live: implement `createSupabaseServices` in ./supabase (same interfaces), flip
 * NEXT_PUBLIC_QBIT9_ADAPTER=supabase. No screen or hook changes.
 */
export function createServices(): Services {
  switch (env.adapter) {
    case "mock":
      return createMockServices({ devtools: env.devtools });
    case "supabase":
      return createSupabaseServices();
    default:
      return createMockServices({ devtools: env.devtools });
  }
}
