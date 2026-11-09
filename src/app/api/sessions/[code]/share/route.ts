import { shareItem } from "@/lib/server/flows";
import { handler, HttpError, readJson, str } from "@/lib/server/http";
import { assertNotClosed, notify, requireMember } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type Ctx = { params: Promise<{ code: string }> };

/** Position mit anderen teilen: freie Menge zu gleichen Teilen auf die gewählten Personen. */
export const POST = handler<Ctx>(async (req, ctx) => {
  const { code } = await ctx.params;
  const { session, me } = await requireMember(req, code);
  assertNotClosed(session);
  const body = await readJson(req);
  const ids = Array.isArray(body.participantIds) ? (body.participantIds as string[]) : [];
  const { data } = await supabaseAdmin().from("participants").select("id").eq("session_id", session.id).in("id", ids);
  const valid = (data ?? []).map((p) => p.id);
  if (valid.length === 0) throw new HttpError(400, "Keine Personen ausgewählt");
  if (!me.is_host && !valid.includes(me.id)) throw new HttpError(403, "Du kannst nur Sachen teilen, an denen du beteiligt bist.");
  await shareItem({ session, itemId: str(body.itemId, "Position"), participantIds: valid });
  await notify(session.id);
  return Response.json({ ok: true });
});
