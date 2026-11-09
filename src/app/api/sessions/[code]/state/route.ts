import { handler } from "@/lib/server/http";
import { loadState, requireMember } from "@/lib/server/session";

type Ctx = { params: Promise<{ code: string }> };

/** Kompletter Zustand der Runde für die App. */
export const GET = handler<Ctx>(async (req, ctx) => {
  const { code } = await ctx.params;
  const { session, me } = await requireMember(req, code);
  const state = await loadState(session.id, me);
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
});
