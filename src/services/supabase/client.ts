import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!cachedClient) {
    const url = env.supabaseUrl || "http://127.0.0.1:54321";
    const anonKey = env.supabaseAnonKey || "dummy-anon-key";
    cachedClient = createClient(url, anonKey);
  }
  return cachedClient;
}

export function setSupabaseClient(client: SupabaseClient | null): void {
  cachedClient = client;
}
