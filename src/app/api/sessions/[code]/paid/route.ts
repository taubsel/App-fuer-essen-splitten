import { handler, HttpError, readJson } from "@/lib/server/http";
import { notify, requireMember } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type Ctx = { params: Promise<{ code: string }> };

/** Als bezahlt markieren – man selbst oder der Host für alle. */
export const POST = handler<Ctx>(async (req, ctx) => {
  const { code } = await ctx.params;
  const { session, me } = await requireMember(req, code);
  const body = await readJson(req);
  const participantId = (body.participantId as string | undefined) ?? me.id;
  if (participantId !== me.id && !me.is_host) throw new HttpError(403, "Das darf nur der Host.");
  const { error } = await supabaseAdmin()
    .from("participants")
    .update({ paid_at: body.paid === false ? null : new Date().toISOString() })
    .eq("id", participantId)
    .eq("session_id", session.id);
  if (error) throw error;
  await notify(session.id);
  return Response.json({ ok: true });
});
