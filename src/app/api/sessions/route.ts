import { handler, num, readJson, str } from "@/lib/server/http";
import { generateCode, postMessage, requireUser } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/** Neue Runde anlegen – wer sie anlegt, ist Host. */
export const POST = handler(async (req) => {
  const userId = await requireUser(req);
  const body = await readJson(req);
  const name = str(body.name, "Dein Name", { max: 40 });
  const title = typeof body.title === "string" && body.title.trim() ? str(body.title, "Titel", { max: 80 }) : defaultTitle();
  const tip = body.tipPercent === undefined || body.tipPercent === "" ? 10 : num(body.tipPercent, "Trinkgeld", { min: 0, max: 100 });

  const db = supabaseAdmin();
  let session: { id: string; code: string } | null = null;
  for (let attempt = 0; attempt < 5 && !session; attempt++) {
    const { data, error } = await db
      .from("sessions")
      .insert({ code: generateCode(), title, host_user_id: userId, tip_percent: tip })
      .select("id, code")
      .single();
    if (!error) session = data;
    else if (error.code !== "23505") throw error; // 23505 = Code schon vergeben → nochmal
  }
  if (!session) throw new Error("Konnte keinen freien Code erzeugen");

  const { error } = await db
    .from("participants")
    .insert({ session_id: session.id, user_id: userId, name, is_host: true });
  if (error) throw error;
  await postMessage({
    session_id: session.id,
    kind: "system",
    body: `${name} hat die Runde „${title}“ gestartet. Schreibt einfach in den Chat, was ihr bestellt habt – z. B. „2 Mythos und ein Gyros“.`,
  });
  return Response.json({ code: session.code });
});

function defaultTitle() {
  const d = new Date();
  return `Essen am ${d.toLocaleDateString("de-DE", { day: "numeric", month: "numeric" })}`;
}
