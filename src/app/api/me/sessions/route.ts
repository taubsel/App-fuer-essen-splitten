import { handler } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/** Runden, in denen ich (auf diesem Gerät) dabei bin. */
export const GET = handler(async (req) => {
  const userId = await requireUser(req);
  const { data, error } = await supabaseAdmin()
    .from("participants")
    .select("name, is_host, sessions(code, title, status, created_at)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const sessions = (data ?? [])
    .map((p) => {
      const s = (Array.isArray(p.sessions) ? p.sessions[0] : p.sessions) as
        | { code: string; title: string; status: string; created_at: string }
        | null;
      return s ? { ...s, myName: p.name, isHost: p.is_host } : null;
    })
    .filter(Boolean);
  return Response.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
});
