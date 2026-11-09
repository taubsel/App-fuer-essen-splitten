import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let admin: SupabaseClient | null = null;

/** Supabase-Client mit Service-Role-Key – nur auf dem Server verwenden! */
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    admin = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return admin;
}
