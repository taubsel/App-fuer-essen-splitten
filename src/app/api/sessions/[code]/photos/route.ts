import { after } from "next/server";
import { processPhoto } from "@/lib/server/flows";
import { handler } from "@/lib/server/http";
import { assertNotClosed, notify, postMessage, rateLimit, requireMember } from "@/lib/server/session";
import { readImages, storeImage } from "@/lib/server/upload";

type Ctx = { params: Promise<{ code: string }> };
export const maxDuration = 120;

/** Tellerfoto in den Chat – die KI markiert, was darauf zu sehen ist. */
export const POST = handler<Ctx>(async (req, ctx) => {
  const { code } = await ctx.params;
  const { session, me } = await requireMember(req, code);
  assertNotClosed(session);
  await rateLimit(me.id, { max: 4, photos: true });
  const [file] = await readImages(req, "images", 1);
  const path = await storeImage(session.id, "plate", file);
  const message = await postMessage({
    session_id: session.id,
    kind: "user",
    participant_id: me.id,
    body: "📷",
    image_path: path,
    ai_status: "pending",
    meta: { photo_status: "analyzing" },
  });
  await notify(session.id);
  after(() => processPhoto(session.id, message.id));
  return Response.json({ id: message.id });
});
