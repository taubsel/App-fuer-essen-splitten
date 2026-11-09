import { handler, readJson } from "@/lib/server/http";
import { notify, postMessage, requireMember } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type Ctx = { params: Promise<{ code: string }> };

/** "Meine Positionen passen" bestätigen bzw. zurücknehmen. */
export const POST = handler<Ctx>(async (req, ctx) => {
  const { code } = await ctx.params;
  const { session, me } = await requireMember(req, code);
  const body = await readJson(req);
  const confirmed = body.confirmed !== false;
  const { error } = await supabaseAdmin()
    .from("participants")
    .update({ confirmed_at: confirmed ? new Date().toISOString() : null })
    .eq("id", me.id);
  if (error) throw error;
  if (confirmed && !me.confirmed_at) {
    await postMessage({ session_id: session.id, kind: "system", body: `${me.name} hat die eigenen Positionen bestätigt ✅` });
  }
  await notify(session.id);
  return Response.json({ ok: true });
});
