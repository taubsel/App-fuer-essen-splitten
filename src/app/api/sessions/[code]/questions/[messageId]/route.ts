import { answerQuestion } from "@/lib/server/flows";
import { handler, num, readJson } from "@/lib/server/http";
import { assertNotClosed, notify, requireMember } from "@/lib/server/session";

type Ctx = { params: Promise<{ code: string; messageId: string }> };

/** Rückfrage der KI per Button beantworten. */
export const POST = handler<Ctx>(async (req, ctx) => {
  const { code, messageId } = await ctx.params;
  const { session, me } = await requireMember(req, code);
  assertNotClosed(session);
  const body = await readJson(req);
  await answerQuestion({ session, me, messageId, optionIndex: num(body.optionIndex, "Antwort", { min: 0, max: 10 }) });
  await notify(session.id);
  return Response.json({ ok: true });
});
