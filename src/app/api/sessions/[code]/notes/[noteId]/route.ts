import { handler } from "@/lib/server/http";
import { notify, requireMember } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type Ctx = { params: Promise<{ code: string; noteId: string }> };

/** Eigene Notiz löschen. */
export const DELETE = handler<Ctx>(async (req, ctx) => {
  const { code, noteId } = await ctx.params;
  const { session, me } = await requireMember(req, code);
  const { error } = await supabaseAdmin()
    .from("notes")
    .delete()
    .eq("id", noteId)
    .eq("session_id", session.id)
    .eq("participant_id", me.id);
  if (error) throw error;
  await notify(session.id);
  return Response.json({ ok: true });
});
