import "server-only";
import { randomInt } from "node:crypto";
import { env } from "./env";
import { HttpError } from "./http";
import { supabaseAdmin } from "./supabase-admin";
import type {
  ClaimRow,
  ItemRow,
  MessageRow,
  NoteRow,
  ParticipantRow,
  SessionRow,
  SessionState,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Authentifizierung (anonyme Supabase-User)
// ---------------------------------------------------------------------------

/** Prüft den Supabase-JWT aus dem Authorization-Header und liefert die User-ID. */
export async function requireUser(req: Request): Promise<string> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Nicht angemeldet");
  const { data, error } = await supabaseAdmin().auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (error || !sub) throw new HttpError(401, "Anmeldung abgelaufen – bitte Seite neu laden");
  return sub;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O/1/I

export function generateCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function getSessionByCode(code: string): Promise<SessionRow> {
  const { data, error } = await supabaseAdmin()
    .from("sessions")
    .select("*")
    .eq("code", normalizeCode(code))
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Diese Runde gibt es nicht (mehr).");
  return data as SessionRow;
}

export async function getSessionById(id: string): Promise<SessionRow> {
  const { data, error } = await supabaseAdmin().from("sessions").select("*").eq("id", id).single();
  if (error) throw error;
  return data as SessionRow;
}

export interface MemberContext {
  userId: string;
  session: SessionRow;
  me: ParticipantRow;
}

/** User muss angemeldet und Teilnehmer der Runde sein. */
export async function requireMember(req: Request, code: string): Promise<MemberContext> {
  const userId = await requireUser(req);
  const session = await getSessionByCode(code);
  const { data: me, error } = await supabaseAdmin()
    .from("participants")
    .select("*")
    .eq("session_id", session.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!me) throw new HttpError(403, "Du bist dieser Runde noch nicht beigetreten.");
  return { userId, session, me: me as ParticipantRow };
}

export async function requireHost(req: Request, code: string): Promise<MemberContext> {
  const ctx = await requireMember(req, code);
  if (!ctx.me.is_host) throw new HttpError(403, "Das darf nur der Host.");
  return ctx;
}

export function assertNotClosed(session: SessionRow) {
  if (session.status === "closed") throw new HttpError(409, "Die Runde ist schon abgeschlossen.");
}

// ---------------------------------------------------------------------------
// Zustand laden
// ---------------------------------------------------------------------------

export interface RawState {
  session: SessionRow;
  participants: ParticipantRow[];
  messages: MessageRow[];
  notes: NoteRow[];
  items: ItemRow[];
  claims: ClaimRow[];
}

export async function loadRawState(sessionId: string): Promise<RawState> {
  const db = supabaseAdmin();
  const [session, participants, messages, notes, items, claims] = await Promise.all([
    db.from("sessions").select("*").eq("id", sessionId).single(),
    db.from("participants").select("*").eq("session_id", sessionId).order("created_at"),
    db.from("messages").select("*").eq("session_id", sessionId).order("created_at").limit(1000),
    db.from("notes").select("*").eq("session_id", sessionId).order("created_at"),
    db.from("receipt_items").select("*").eq("session_id", sessionId).order("position").order("created_at"),
    db.from("claims").select("*").eq("session_id", sessionId).order("created_at"),
  ]);
  for (const r of [session, participants, messages, notes, items, claims]) if (r.error) throw r.error;
  return {
    session: session.data as SessionRow,
    participants: participants.data as ParticipantRow[],
    messages: messages.data as MessageRow[],
    notes: notes.data as NoteRow[],
    items: items.data as ItemRow[],
    claims: claims.data as ClaimRow[],
  };
}

const SIGNED_URL_TTL = 60 * 60; // 1 Stunde

export async function loadState(sessionId: string, me: ParticipantRow): Promise<SessionState> {
  const raw = await loadRawState(sessionId);
  const db = supabaseAdmin();

  const photoMessages = raw.messages.filter((m) => m.image_path);
  const paths = [...photoMessages.map((m) => m.image_path as string), ...raw.session.receipt_images];
  const photoUrls: Record<string, string> = {};
  let receiptUrls: string[] = [];
  if (paths.length > 0) {
    const { data, error } = await db.storage.from("photos").createSignedUrls(paths, SIGNED_URL_TTL);
    if (!error && data) {
      const byPath = new Map(data.map((d) => [d.path, d.signedUrl]));
      for (const m of photoMessages) {
        const url = byPath.get(m.image_path as string);
        if (url) photoUrls[m.id] = url;
      }
      receiptUrls = raw.session.receipt_images.map((p) => byPath.get(p)).filter(Boolean) as string[];
    }
  }

  const freshMe = raw.participants.find((p) => p.id === me.id) ?? me;
  return { ...raw, me: freshMe, photoUrls, receiptUrls };
}

// ---------------------------------------------------------------------------
// Live-Updates: datenloser "refresh"-Ping an alle Geräte der Runde
// ---------------------------------------------------------------------------

export function channelName(sessionId: string) {
  return `session-${sessionId}`;
}

export async function notify(sessionId: string): Promise<void> {
  try {
    const res = await fetch(`${env.supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: env.supabaseServiceKey,
        Authorization: `Bearer ${env.supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic: channelName(sessionId), event: "refresh", payload: { at: Date.now() } }],
      }),
    });
    if (!res.ok && res.status !== 202) console.warn("notify fehlgeschlagen", res.status, await res.text());
  } catch (err) {
    console.warn("notify fehlgeschlagen", err);
  }
}

// ---------------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------------

export async function postMessage(input: {
  session_id: string;
  kind: MessageRow["kind"];
  body: string;
  participant_id?: string | null;
  recipient_id?: string | null;
  question_status?: MessageRow["question_status"];
  ai_status?: MessageRow["ai_status"];
  image_path?: string | null;
  meta?: MessageRow["meta"];
}): Promise<MessageRow> {
  const { data, error } = await supabaseAdmin().from("messages").insert(input).select("*").single();
  if (error) throw error;
  return data as MessageRow;
}

/** Bestätigung zurücksetzen, wenn sich die Positionen einer Person ändern. */
export async function resetConfirmation(participantIds: string[]) {
  if (participantIds.length === 0) return;
  const { error } = await supabaseAdmin()
    .from("participants")
    .update({ confirmed_at: null })
    .in("id", participantIds)
    .not("confirmed_at", "is", null);
  if (error) throw error;
}
