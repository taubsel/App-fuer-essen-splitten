import { handler, num, readJson, str } from "@/lib/server/http";
import { assertNotClosed, notify, requireHost } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type Ctx = { params: Promise<{ code: string }> };

/** Position von Hand hinzufügen (Host). */
export const POST = handler<Ctx>(async (req, ctx) => {
  const { code } = await ctx.params;
  const { session } = await requireHost(req, code);
  assertNotClosed(session);
  const body = await readJson(req);
  const db = supabaseAdmin();
  const { data: last } = await db
    .from("receipt_items")
    .select("position")
    .eq("session_id", session.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const name = str(body.name, "Bezeichnung", { max: 200 });
  const { error } = await db.from("receipt_items").insert({
    session_id: session.id,
    position: (last?.position ?? -1) + 1,
    name_original: name,
    name_de: body.nameDe ? str(body.nameDe, "Übersetzung", { max: 200 }) : name,
    quantity: num(body.quantity ?? 1, "Menge", { min: 0.001, max: 1000 }),
    total_price: num(body.totalPrice, "Preis", { min: -100000, max: 100000 }),
  });
  if (error) throw error;
  if (session.status === "open") await db.from("sessions").update({ status: "assigning" }).eq("id", session.id);
  await notify(session.id);
  return Response.json({ ok: true });
});
