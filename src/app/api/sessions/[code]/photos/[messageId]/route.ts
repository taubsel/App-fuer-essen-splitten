import { after } from "next/server";
import { confirmPhoto } from "@/lib/server/flows";
import { handler, HttpError, readJson } from "@/lib/server/http";
import { assertNotClosed, notify, requireMember } from "@/lib/server/session";

type Ctx = { params: Promise<{ code: string; messageId: string }> };
export const maxDuration = 120;

/** Auswahl auf dem Tellerfoto bestätigen → Notizen. */
export const POST = handler<Ctx>(async (req, ctx) => {
  const { code, messageId } = await ctx.params;
  const { session, me } = await requireMember(req, code);
  assertNotClosed(session);
  const body = await readJson(req);
  if (!Array.isArray(body.selected)) throw new HttpError(400, "Auswahl fehlt");
  const selected = (body.selected as unknown[]).map(Boolean);
  after(async () => {
    try {
      await confirmPhoto({ session, me, messageId, selected });
    } catch (err) {
      console.error("confirmPhoto", err);
    } finally {
      await notify(session.id);
    }
  });
  return Response.json({ ok: true });
});
