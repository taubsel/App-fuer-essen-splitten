"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase ist nicht konfiguriert (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY).");
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "tischrechnung-auth" },
    });
  }
  return client;
}

let pending: Promise<string> | null = null;

/** Liefert ein gültiges Access-Token – legt bei Bedarf einen anonymen User an. */
export async function accessToken(): Promise<string> {
  const { data } = await supabase().auth.getSession();
  const session = data.session;
  if (session && session.expires_at && session.expires_at * 1000 > Date.now() + 60_000) {
    return session.access_token;
  }
  if (session) {
    const { data: refreshed } = await supabase().auth.refreshSession();
    if (refreshed.session) return refreshed.session.access_token;
  }
  if (!pending) {
    pending = supabase()
      .auth.signInAnonymously()
      .then(({ data: d, error }) => {
        if (error || !d.session) throw new Error(error?.message ?? "Anmeldung fehlgeschlagen");
        return d.session.access_token;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
