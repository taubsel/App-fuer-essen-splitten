import { handler, readJson, str } from "@/lib/server/http";
import { getSessionByCode, notify, postMessage, requireUser } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type Ctx = { params: Promise<{ code: string }> };

/** Runde beitreten – nur mit Namen, kein Account. */
export const POST = handler<Ctx>(async (req, ctx) => {
  const { code } = await ctx.params;
  const userId = await requireUser(req);
  const session = await getSessionByCode(code);
  const body = await readJson(req);
  const name = str(body.name, "Dein Name", { max: 40 });
  const db = supabaseAdmin();

  const { data: existing } = await db
    .from("participants")
    .select("id")
    .eq("session_id", session.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return Response.json({ ok: true, code: session.code });

  // Doppelte Namen unterscheidbar machen
  const { data: others } = await db.from("participants").select("name").eq("session_id", session.id);
  let finalName = name;
  const taken = new Set((others ?? []).map((o) => o.name.toLowerCase()));
  for (let i = 2; taken.has(finalName.toLowerCase()); i++) finalName = `${name} ${i}`;

  const { error } = await db.from("participants").insert({ session_id: session.id, user_id: userId, name: finalName });
  if (error && error.code !== "23505") throw error;
  if (!error) await postMessage({ session_id: session.id, kind: "system", body: `${finalName} ist dabei 👋` });
  await notify(session.id);
  return Response.json({ ok: true, code: session.code });
});
