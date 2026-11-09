import { splitRest } from "@/lib/server/flows";
import { handler, readJson } from "@/lib/server/http";
import { assertNotClosed, notify, requireHost } from "@/lib/server/session";

type Ctx = { params: Promise<{ code: string }> };

/** Alles noch Offene gleichmäßig auf die gewählten Personen verteilen (Host). */
export const POST = handler<Ctx>(async (req, ctx) => {
  const { code } = await ctx.params;
  const { session } = await requireHost(req, code);
  assertNotClosed(session);
  const body = await readJson(req);
  const ids = Array.isArray(body.participantIds) ? (body.participantIds as string[]) : [];
  const count = await splitRest(session, ids);
  await notify(session.id);
  return Response.json({ ok: true, items: count });
});
