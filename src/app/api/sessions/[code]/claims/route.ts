import { setClaim } from "@/lib/server/flows";
import { handler, HttpError, num, readJson, str } from "@/lib/server/http";
import { assertNotClosed, notify, requireMember } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type Ctx = { params: Promise<{ code: string }> };

/** Menge einer Position für mich (oder als Host für jemand anderen) setzen. 0 = entfernen. */
export const PUT = handler<Ctx>(async (req, ctx) => {
  const { code } = await ctx.params;
  const { session, me } = await requireMember(req, code);
  assertNotClosed(session);
  const body = await readJson(req);
  let participantId = me.id;
  if (body.participantId && body.participantId !== me.id) {
    if (!me.is_host) throw new HttpError(403, "Nur der Host kann für andere eintragen.");
    const { data } = await supabaseAdmin()
      .from("participants")
      .select("id")
      .eq("id", body.participantId as string)
      .eq("session_id", session.id)
      .maybeSingle();
    if (!data) throw new HttpError(404, "Person nicht gefunden");
    participantId = data.id;
  }
  await setClaim({
    session,
    participantId,
    itemId: str(body.itemId, "Position"),
    quantity: num(body.quantity, "Menge", { min: 0, max: 1000 }),
  });
  await notify(session.id);
  return Response.json({ ok: true });
});
