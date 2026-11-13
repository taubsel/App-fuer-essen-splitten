import { handler, HttpError, num, readJson, str } from "@/lib/server/http";
import { getSessionByCode, notify, postMessage, requireHost } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { formatMoney } from "@/lib/calc";

type Ctx = { params: Promise<{ code: string }> };

/** Öffentliche Kurzinfo für den Beitreten-Bildschirm (nur mit Code abrufbar). */
export const GET = handler<Ctx>(async (_req, ctx) => {
  const { code } = await ctx.params;
  const session = await getSessionByCode(code);
  const { data: participants } = await supabaseAdmin()
    .from("participants")
    .select("name, is_host")
    .eq("session_id", session.id);
  return Response.json({
    code: session.code,
    title: session.title,
    status: session.status,
    hostName: participants?.find((p) => p.is_host)?.name ?? null,
    participantNames: participants?.map((p) => p.name) ?? [],
  });
});

/** Host-Einstellungen: Titel, Trinkgeld, Status */
export const PATCH = handler<Ctx>(async (req, ctx) => {
  const { code } = await ctx.params;
  const { session, me } = await requireHost(req, code);
  const body = await readJson(req);
  const update: Record<string, unknown> = {};
  if (body.title !== undefined) update.title = str(body.title, "Titel", { max: 80 });
  if (body.tipPercent !== undefined) update.tip_percent = num(body.tipPercent, "Trinkgeld", { min: 0, max: 100 });
  if (body.receiptTotal !== undefined)
    update.receipt_total = body.receiptTotal === null ? null : num(body.receiptTotal, "Summe", { min: 0, max: 100000 });
  if (body.status !== undefined) {
    if (!["open", "assigning", "closed"].includes(body.status as string)) throw new HttpError(400, "Ungültiger Status");
    update.status = body.status;
  }
  if (Object.keys(update).length === 0) throw new HttpError(400, "Nichts zu ändern");
  const { error } = await supabaseAdmin().from("sessions").update(update).eq("id", session.id);
  if (error) throw error;

  if (update.tip_percent !== undefined && update.tip_percent !== session.tip_percent) {
    await postMessage({
      session_id: session.id,
      kind: "system",
      body: `${me.name} hat das Trinkgeld auf ${String(update.tip_percent).replace(".", ",")} % gesetzt.`,
    });
  }
  if (update.status === "closed" && session.status !== "closed") {
    const { count } = await supabaseAdmin()
      .from("receipt_items")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id);
    await postMessage({
      session_id: session.id,
      kind: "system",
      body: count
        ? `✅ ${me.name} hat die Runde abgeschlossen. Schaut unter „Ich“, was ihr überweisen müsst${
            session.receipt_total ? ` (Rechnung gesamt ${formatMoney(session.receipt_total)})` : ""
          }.`
        : `${me.name} hat die Runde beendet.`,
    });
  }
  if (update.status && update.status !== "closed" && session.status === "closed") {
    await postMessage({ session_id: session.id, kind: "system", body: `${me.name} hat die Runde wieder geöffnet.` });
  }
  await notify(session.id);
  return Response.json({ ok: true });
});

/** Runde endgültig löschen (Host): alle Nachrichten, Positionen, Zuordnungen und Fotos. */
export const DELETE = handler<Ctx>(async (req, ctx) => {
  const { code } = await ctx.params;
  const { session } = await requireHost(req, code);
  const db = supabaseAdmin();

  // Fotos aus dem Speicher entfernen (Ordner = Session-ID)
  for (;;) {
    const { data: files, error } = await db.storage.from("photos").list(session.id, { limit: 100 });
    if (error) throw error;
    if (!files?.length) break;
    const { error: rmError } = await db.storage.from("photos").remove(files.map((f) => `${session.id}/${f.name}`));
    if (rmError) throw rmError;
    if (files.length < 100) break;
  }

  // Alles andere hängt per ON DELETE CASCADE an der Session
  const { error } = await db.from("sessions").delete().eq("id", session.id);
  if (error) throw error;
  await notify(session.id); // die anderen Geräte merken beim nächsten Laden, dass die Runde weg ist
  return Response.json({ ok: true });
});
