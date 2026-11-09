import { after } from "next/server";
import { runMatchAll } from "@/lib/server/flows";
import { handler, HttpError } from "@/lib/server/http";
import { assertNotClosed, requireHost } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type Ctx = { params: Promise<{ code: string }> };
export const maxDuration = 300;

/** KI-Zuordnung für alle starten (Host). */
export const POST = handler<Ctx>(async (req, ctx) => {
  const { code } = await ctx.params;
  const { session } = await requireHost(req, code);
  assertNotClosed(session);
  if (session.match_status === "running") throw new HttpError(409, "Die Zuordnung läuft schon.");
  const { count } = await supabaseAdmin()
    .from("receipt_items")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id);
  if (!count) throw new HttpError(409, "Erst den Kassenzettel fotografieren.");
  await supabaseAdmin().from("sessions").update({ match_status: "running" }).eq("id", session.id);
  after(() => runMatchAll(session.id));
  return Response.json({ ok: true });
});
