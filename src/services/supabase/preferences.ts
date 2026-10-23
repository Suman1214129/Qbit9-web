import type { SupabaseClient } from "@supabase/supabase-js";
import { DomainError, type ID, type Preferences } from "@/domain";
import type { PreferencesService } from "../types";
import { defaultPrefs } from "./auth";
import { getSupabaseClient } from "./client";

export function createPreferencesService(client?: SupabaseClient): PreferencesService {
  const sb = client ?? getSupabaseClient();

  const getCurrentUser = async () => {
    const { data } = await sb.auth.getUser();
    if (!data?.user) throw new DomainError("not_signed_in");
    return data.user;
  };

  const getProfile = async (userId: string) => {
    const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error && error.code !== "PGRST116") throw new Error(error.message);
    return (data as Record<string, unknown>) ?? null;
  };

  return {
    async get(): Promise<Preferences> {
      const user = await getCurrentUser();
      const profile = await getProfile(user.id);
      if (!profile || !profile.alerts) {
        return defaultPrefs(user.phone ? "phone" : "email");
      }
      return profile.alerts as Preferences;
    },

    async update(patch: Partial<Preferences>): Promise<Preferences> {
      const user = await getCurrentUser();
      const profile = await getProfile(user.id);
      const current = (profile?.alerts as Preferences) ?? defaultPrefs(user.phone ? "phone" : "email");
      const next: Preferences = { ...current, ...patch };

      await sb.from("profiles").update({ alerts: next }).eq("id", user.id);
      return next;
    },

    async toggleSavedBranch(branchId: ID): Promise<Preferences> {
      if (!branchId) throw new DomainError("branch_not_found");
      const user = await getCurrentUser();
      const profile = await getProfile(user.id);
      const current = (profile?.alerts as Preferences) ?? defaultPrefs(user.phone ? "phone" : "email");

      const saved = current.savedBranchIds.includes(branchId)
        ? current.savedBranchIds.filter((id) => id !== branchId)
        : [...current.savedBranchIds, branchId];

      const next: Preferences = { ...current, savedBranchIds: saved };
      await sb.from("profiles").update({ alerts: next }).eq("id", user.id);
      return next;
    },
  };
}

export const createSupabasePreferencesService = createPreferencesService;
