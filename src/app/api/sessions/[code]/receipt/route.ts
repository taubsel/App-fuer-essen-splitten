import { after } from "next/server";
import { processReceipt } from "@/lib/server/flows";
import { handler, HttpError } from "@/lib/server/http";
import { assertNotClosed, notify, requireMember } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { readImages, storeImage } from "@/lib/server/upload";

type Ctx = { params: Promise<{ code: string }> };
export const maxDuration = 300;

/** Kassenzettel-Foto(s) hochladen → KI liest die Positionen aus. */
export const POST = handler<Ctx>(async (req, ctx) => {
  const { code } = await ctx.params;
  const { session } = await requireMember(req, code);
  assertNotClosed(session);
  if (session.receipt_status === "processing") throw new HttpError(409, "Der Kassenzettel wird gerade schon gelesen.");
  const files = await readImages(req, "images", 4);
  const paths = await Promise.all(files.map((f) => storeImage(session.id, "receipt", f)));

  const db = supabaseAdmin();
  if (session.receipt_images.length) await db.storage.from("photos").remove(session.receipt_images);
  const { error } = await db
    .from("sessions")
    .update({ receipt_images: paths, receipt_status: "processing", receipt_error: null })
    .eq("id", session.id);
  if (error) throw error;
  await notify(session.id);
  after(() => processReceipt(session.id));
  return Response.json({ ok: true });
});
