import type { Services } from "../types";
import { createAuthService } from "./auth";
import { createBookingService } from "./bookings";
import { createBranchService } from "./branches";
import { createDevApi } from "./devtools";
import { createHistoryService } from "./history";
import { createPreferencesService } from "./preferences";
import { createQueueService } from "./queue";

export function createMockServices(opts: { devtools: boolean }): Services {
  return {
    branches: createBranchService(),
    auth: createAuthService(),
    queue: createQueueService(),
    bookings: createBookingService(),
    history: createHistoryService(),
    preferences: createPreferencesService(),
    dev: opts.devtools ? createDevApi() : undefined,
  };
}
