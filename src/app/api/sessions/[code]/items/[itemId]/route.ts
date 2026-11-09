import { handler, HttpError, num, readJson, str } from "@/lib/server/http";
import { assertNotClosed, notify, requireHost } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type Ctx = { params: Promise<{ code: string; itemId: string }> };

/** Position korrigieren (Host). */
export const PATCH = handler<Ctx>(async (req, ctx) => {
  const { code, itemId } = await ctx.params;
  const { session } = await requireHost(req, code);
  assertNotClosed(session);
  const body = await readJson(req);
  const update: Record<string, unknown> = {};
  if (body.nameOriginal !== undefined) update.name_original = str(body.nameOriginal, "Bezeichnung", { max: 200 });
  if (body.nameDe !== undefined) update.name_de = str(body.nameDe, "Übersetzung", { max: 200 });
  if (body.quantity !== undefined) update.quantity = num(body.quantity, "Menge", { min: 0.001, max: 1000 });
  if (body.totalPrice !== undefined) update.total_price = num(body.totalPrice, "Preis", { min: -100000, max: 100000 });
  if (Object.keys(update).length === 0) throw new HttpError(400, "Nichts zu ändern");
  const { error } = await supabaseAdmin()
    .from("receipt_items")
    .update(update)
    .eq("id", itemId)
    .eq("session_id", session.id);
  if (error) throw error;
  await notify(session.id);
  return Response.json({ ok: true });
});

/** Position löschen (Host). */
export const DELETE = handler<Ctx>(async (req, ctx) => {
  const { code, itemId } = await ctx.params;
  const { session } = await requireHost(req, code);
  assertNotClosed(session);
  const { error } = await supabaseAdmin().from("receipt_items").delete().eq("id", itemId).eq("session_id", session.id);
  if (error) throw error;
  await notify(session.id);
  return Response.json({ ok: true });
});
