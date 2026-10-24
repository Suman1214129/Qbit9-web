import type { Services } from "../types";
import { createBranchService } from "./branches";
import { createAuthService } from "./auth";
import { createPreferencesService } from "./preferences";
import { createQueueService } from "./queue";
import { createBookingService } from "./bookings";
import { createHistoryService } from "./history";
import { createStaffService } from "./staff";
import { getSupabaseClient } from "./client";

export * from "./branches";
export * from "./auth";
export * from "./preferences";
export * from "./queue";
export * from "./bookings";
export * from "./history";
export * from "./staff";
export * from "./client";

/**
 * Factory for production/staging Supabase services.
 * Implements the same Services interface contract as the mock adapter.
 */
export function createSupabaseServices(): Services {
  const client = getSupabaseClient();
  return {
    branches: createBranchService(client),
    auth: createAuthService(client),
    preferences: createPreferencesService(client),
    queue: createQueueService(client),
    bookings: createBookingService(client),
    history: createHistoryService(client),
    staff: createStaffService(client),
    dev: undefined,
    staffDev: undefined,
  };
}
