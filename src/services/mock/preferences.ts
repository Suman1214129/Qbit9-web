import { DomainError, type Preferences } from "@/domain";
import { clock } from "@/lib/clock";
import { currentUser, defaultPrefs } from "./auth";
import { mutate } from "./db";
import type { PreferencesService } from "../types";

export function createPreferencesService(): PreferencesService {
  return {
    async get() {
      return mutate((db) => {
        const user = currentUser(db, clock.now());
        return (db.prefs[user.id] ??= defaultPrefs(user.phone ? "phone" : "email"));
      });
    },
    async update(patch) {
      return mutate((db) => {
        const user = currentUser(db, clock.now());
        const next: Preferences = { ...(db.prefs[user.id] ?? defaultPrefs(user.phone ? "phone" : "email")), ...patch };
        db.prefs[user.id] = next;
        return next;
      });
    },
    async toggleSavedBranch(branchId) {
      return mutate((db) => {
        const user = currentUser(db, clock.now());
        const cur = db.prefs[user.id] ?? defaultPrefs(user.phone ? "phone" : "email");
        if (!branchId) throw new DomainError("branch_not_found");
        const saved = cur.savedBranchIds.includes(branchId) ? cur.savedBranchIds.filter((x) => x !== branchId) : [...cur.savedBranchIds, branchId];
        const next = { ...cur, savedBranchIds: saved };
        db.prefs[user.id] = next;
        return next;
      });
    },
  };
}
