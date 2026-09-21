import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config/env.js";

export function createDatabaseClient(config: AppConfig): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function checkDatabaseHealth(database: SupabaseClient): Promise<void> {
  const { error } = await database.from("users").select("id", { head: true, count: "exact" }).limit(1);
  if (error) throw new Error(`Supabase health check bajarilmadi: ${error.message}`);
}
