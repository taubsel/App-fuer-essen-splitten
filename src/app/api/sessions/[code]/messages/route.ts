import { after } from "next/server";
import { processUserMessage } from "@/lib/server/flows";
import { handler, readJson, str } from "@/lib/server/http";
import { assertNotClosed, notify, postMessage, rateLimit, requireMember } from "@/lib/server/session";

type Ctx = { params: Promise<{ code: string }> };
export const maxDuration = 120;

/** Chat-Nachricht schicken – die KI verarbeitet sie im Hintergrund. */
export const POST = handler<Ctx>(async (req, ctx) => {
  const { code } = await ctx.params;
  const { session, me } = await requireMember(req, code);
  assertNotClosed(session);
  await rateLimit(me.id, { max: 12 });
  const body = await readJson(req);
  const text = str(body.body, "Nachricht", { max: 1000 });
  const message = await postMessage({
    session_id: session.id,
    kind: "user",
    participant_id: me.id,
    body: text,
    ai_status: "pending",
  });
  await notify(session.id);
  after(() => processUserMessage(session.id, message.id));
  return Response.json({ id: message.id });
});
