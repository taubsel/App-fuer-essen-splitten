import "server-only";
import { computeSettlement, formatMoney, formatQty, roundQty, splitRemaining, unitPrice } from "@/lib/calc";
import type { ImageInput } from "@/lib/ai/openai";
import {
  detectDishes,
  extractNotes,
  matchAll,
  matchPerson,
  parseReceipt,
  type AiItem,
  type AiPerson,
} from "@/lib/ai/tasks";
import type {
  ClaimRow,
  DetectedDish,
  ItemRow,
  MessageRow,
  ParticipantRow,
  QuestionOption,
  SessionRow,
} from "@/lib/types";
import { HttpError } from "./http";
import { loadRawState, notify, postMessage, resetConfirmation, type RawState } from "./session";
import { supabaseAdmin } from "./supabase-admin";

const db = () => supabaseAdmin();

// ---------------------------------------------------------------------------
// Referenzen für die KI (I1…, P1…)
// ---------------------------------------------------------------------------

interface Refs {
  itemRef: Map<string, string>;
  itemByRef: Map<string, ItemRow>;
  personRef: Map<string, string>;
  personByRef: Map<string, ParticipantRow>;
}

function buildRefs(state: RawState): Refs {
  const itemRef = new Map<string, string>();
  const itemByRef = new Map<string, ItemRow>();
  state.items.forEach((it, i) => {
    itemRef.set(it.id, `I${i + 1}`);
    itemByRef.set(`I${i + 1}`, it);
  });
  const personRef = new Map<string, string>();
  const personByRef = new Map<string, ParticipantRow>();
  state.participants.forEach((p, i) => {
    personRef.set(p.id, `P${i + 1}`);
    personByRef.set(`P${i + 1}`, p);
  });
  return { itemRef, itemByRef, personRef, personByRef };
}

function aiItems(state: RawState, refs: Refs): AiItem[] {
  return state.items.map((it) => ({
    ref: refs.itemRef.get(it.id)!,
    name_original: it.name_original,
    name_de: it.name_de,
    quantity: it.quantity,
    unit_price: Math.round(unitPrice(it) * 100) / 100,
    total_price: it.total_price,
  }));
}

function chatFor(state: RawState, participantId: string, limit = 40): string[] {
  const lines: string[] = [];
  for (const m of state.messages) {
    if (m.kind === "user" && m.participant_id === participantId) {
      lines.push(`Person: ${m.body}`);
    } else if ((m.kind === "ai" || m.kind === "question") && m.recipient_id === participantId) {
      const opts = m.meta.options?.length ? ` (Optionen: ${m.meta.options.map((o) => o.label).join(" | ")})` : "";
      const status = m.kind === "question" ? ` [${m.question_status === "open" ? "offen" : "erledigt"}]` : "";
      lines.push(`${m.kind === "question" ? "KI-Rückfrage" : "KI"}: ${m.body}${opts}${status}`);
    }
  }
  return lines.slice(-limit);
}

function aiPerson(state: RawState, refs: Refs, p: ParticipantRow): AiPerson {
  return {
    ref: refs.personRef.get(p.id)!,
    name: p.name,
    notes: state.notes
      .filter((n) => n.participant_id === p.id)
      .map((n) => ({ description: n.description, quantity: n.quantity, variant: n.variant, shared_with: n.shared_with })),
    chat: chatFor(state, p.id),
  };
}

function cleanQty(q: number): number | null {
  if (!Number.isFinite(q) || q <= 0) return null;
  return roundQty(q);
}

/** KI-Optionen (Refs) → Optionen mit echten IDs */
function toOptions(
  refs: Refs,
  options: { label: string; assignments: { item: string; quantity: number }[] }[],
): QuestionOption[] {
  return options
    .map((o) => ({
      label: o.label.slice(0, 80),
      assignments: o.assignments
        .map((a) => ({ item_id: refs.itemByRef.get(a.item)?.id, quantity: cleanQty(a.quantity) }))
        .filter((a): a is { item_id: string; quantity: number } => !!a.item_id && a.quantity !== null),
    }))
    .slice(0, 4);
}

// ---------------------------------------------------------------------------
// Claims schreiben
// ---------------------------------------------------------------------------

/** Ersetzt die Claims einer Person (optional nur bestimmter Quellen) durch eine neue Liste. */
async function replaceClaims(opts: {
  sessionId: string;
  participantId: string;
  keepSources: ClaimRow["source"][];
  current: ClaimRow[];
  next: { item_id: string; quantity: number }[];
  source: ClaimRow["source"];
}): Promise<boolean> {
  const { sessionId, participantId, keepSources, current, next, source } = opts;
  const mine = current.filter((c) => c.participant_id === participantId);
  const kept = mine.filter((c) => keepSources.includes(c.source));
  const replaceable = mine.filter((c) => !keepSources.includes(c.source));
  const nextByItem = new Map<string, number>();
  for (const n of next) {
    if (kept.some((k) => k.item_id === n.item_id)) continue; // feste Zuordnung hat Vorrang
    nextByItem.set(n.item_id, roundQty((nextByItem.get(n.item_id) ?? 0) + n.quantity));
  }

  let changed = false;
  const toDelete = replaceable.filter((c) => !nextByItem.has(c.item_id)).map((c) => c.id);
  if (toDelete.length) {
    const { error } = await db().from("claims").delete().in("id", toDelete);
    if (error) throw error;
    changed = true;
  }
  const upserts = [...nextByItem.entries()]
    .filter(([itemId, q]) => {
      const existing = replaceable.find((c) => c.item_id === itemId);
      return !existing || Math.abs(existing.quantity - q) > 1e-6 || existing.source !== source;
    })
    .map(([item_id, quantity]) => ({ session_id: sessionId, participant_id: participantId, item_id, quantity, source }));
  if (upserts.length) {
    const { error } = await db().from("claims").upsert(upserts, { onConflict: "item_id,participant_id" });
    if (error) throw error;
    changed = true;
  }
  return changed;
}

export async function setClaim(opts: {
  session: SessionRow;
  participantId: string;
  itemId: string;
  quantity: number;
}) {
  const { session, participantId, itemId, quantity } = opts;
  const { data: item } = await db()
    .from("receipt_items")
    .select("id, quantity")
    .eq("id", itemId)
    .eq("session_id", session.id)
    .maybeSingle();
  if (!item) throw new HttpError(404, "Position nicht gefunden");
  if (quantity > item.quantity + 1e-6) throw new HttpError(400, "So oft steht das nicht auf dem Bon.");
  if (quantity <= 0) {
    const { error } = await db().from("claims").delete().eq("item_id", itemId).eq("participant_id", participantId);
    if (error) throw error;
  } else {
    const { error } = await db()
      .from("claims")
      .upsert(
        { session_id: session.id, participant_id: participantId, item_id: itemId, quantity: roundQty(quantity), source: "manual" },
        { onConflict: "item_id,participant_id" },
      );
    if (error) throw error;
  }
  await resetConfirmation([participantId]);
}

/** Geteilt-Funktion: eine Position zu gleichen Teilen auf mehrere Personen legen. */
export async function shareItem(opts: { session: SessionRow; itemId: string; participantIds: string[] }) {
  const { session, itemId, participantIds } = opts;
  const { data: item } = await db()
    .from("receipt_items")
    .select("*")
    .eq("id", itemId)
    .eq("session_id", session.id)
    .maybeSingle();
  if (!item) throw new HttpError(404, "Position nicht gefunden");
  const { data: claims } = await db().from("claims").select("*").eq("item_id", itemId);
  const others = (claims as ClaimRow[]).filter((c) => !participantIds.includes(c.participant_id));
  const taken = others.reduce((s, c) => s + c.quantity, 0);
  const free = (item as ItemRow).quantity - taken;
  if (free <= 1e-6) throw new HttpError(409, "Diese Position ist schon komplett vergeben.");
  const share = roundQty(free / participantIds.length);
  const { error } = await db()
    .from("claims")
    .upsert(
      participantIds.map((pid) => ({
        session_id: session.id,
        participant_id: pid,
        item_id: itemId,
        quantity: share,
        source: "manual" as const,
      })),
      { onConflict: "item_id,participant_id" },
    );
  if (error) throw error;
  await resetConfirmation(participantIds);
}

export async function splitRest(session: SessionRow, participantIds: string[]) {
  const state = await loadRawState(session.id);
  const valid = participantIds.filter((id) => state.participants.some((p) => p.id === id));
  if (valid.length === 0) throw new HttpError(400, "Keine Personen ausgewählt");
  const rows = splitRemaining({ items: state.items, claims: state.claims, participantIds: valid });
  if (rows.length === 0) return 0;
  const { error } = await db()
    .from("claims")
    .upsert(
      rows.map((r) => ({ ...r, session_id: session.id, source: "split" as const })),
      { onConflict: "item_id,participant_id" },
    );
  if (error) throw error;
  await resetConfirmation(valid);
  const names = state.participants.filter((p) => valid.includes(p.id)).map((p) => p.name);
  const itemCount = new Set(rows.map((r) => r.item_id)).size;
  await postMessage({
    session_id: session.id,
    kind: "system",
    body: `Der Host hat ${itemCount} offene Position${itemCount === 1 ? "" : "en"} gleichmäßig auf ${names.join(", ")} verteilt.`,
  });
  return itemCount;
}

// ---------------------------------------------------------------------------
// Chat-Nachricht verarbeiten
// ---------------------------------------------------------------------------

export async function processUserMessage(sessionId: string, messageId: string): Promise<void> {
  try {
    const state = await loadRawState(sessionId);
    const message = state.messages.find((m) => m.id === messageId);
    if (!message || !message.participant_id) return;
    const author = state.participants.find((p) => p.id === message.participant_id);
    if (!author) return;

    const hasReceipt = state.items.length > 0;
    const openQuestion = state.messages.find(
      (m) => m.kind === "question" && m.recipient_id === author.id && m.question_status === "open",
    );

    // Antwort auf eine offene Rückfrage → direkt neu zuordnen, keine Notizen
    if (hasReceipt && openQuestion) {
      await rematchPerson(state, author, message.body);
    } else {
      const refs = buildRefs(state);
      const settlement = hasReceipt
        ? computeSettlement({
            items: state.items,
            claims: state.claims,
            participants: state.participants,
            tipPercent: state.session.tip_percent,
          })
        : null;
      const myTotal = settlement ? formatMoney(settlement.participants[author.id]?.total ?? 0) : null;
      const myNotes = state.notes.filter((n) => n.participant_id === author.id);
      const result = await extractNotes({
        author: author.name,
        message: message.body,
        participants: state.participants.map((p) => p.name),
        existingNotes: myNotes.map((n) => ({
          id: n.id,
          description: n.description,
          quantity: n.quantity,
          variant: n.variant,
          shared_with: n.shared_with,
        })),
        receiptItems: hasReceipt ? aiItems(state, refs) : [],
        myTotal,
      });

      const removeIds = result.remove_note_ids.filter((id) => myNotes.some((n) => n.id === id));
      if (removeIds.length) await db().from("notes").delete().in("id", removeIds);
      const toInsert = result.add
        .map((n) => ({
          session_id: sessionId,
          participant_id: author.id,
          message_id: message.id,
          description: n.description.slice(0, 120),
          quantity: cleanQty(n.quantity),
          variant: n.variant,
          shared_with: n.shared_with.slice(0, 20),
          source: "chat" as const,
        }))
        .filter((n) => n.quantity !== null);
      if (toInsert.length) {
        const { error } = await db().from("notes").insert(toInsert);
        if (error) throw error;
      }

      const changedNotes = toInsert.length > 0 || removeIds.length > 0;
      if (hasReceipt && changedNotes && state.session.status !== "closed") {
        // Bon ist schon da → direkt auf Positionen abbilden
        const fresh = await loadRawState(sessionId);
        await rematchPerson(fresh, author, message.body);
      } else {
        await postMessage({ session_id: sessionId, kind: "ai", body: result.reply, recipient_id: author.id });
      }
    }

    await db().from("messages").update({ ai_status: "done" }).eq("id", messageId);
  } catch (err) {
    console.error("processUserMessage", err);
    await db().from("messages").update({ ai_status: "error" }).eq("id", messageId);
    await postMessage({
      session_id: sessionId,
      kind: "system",
      body: "Die KI konnte diese Nachricht gerade nicht verarbeiten. Versuch es gleich nochmal.",
    }).catch(() => {});
  } finally {
    await notify(sessionId);
  }
}

// ---------------------------------------------------------------------------
// Eine Person neu zuordnen
// ---------------------------------------------------------------------------

async function rematchPerson(state: RawState, person: ParticipantRow, latest: string): Promise<void> {
  const refs = buildRefs(state);
  const others = state.claims.filter((c) => c.participant_id !== person.id);
  const mine = state.claims.filter((c) => c.participant_id === person.id);
  const items = aiItems(state, refs).map((it) => {
    const item = refs.itemByRef.get(it.ref)!;
    const taken = others.filter((c) => c.item_id === item.id).reduce((s, c) => s + c.quantity, 0);
    return { ...it, available: roundQty(Math.max(0, item.quantity - taken)) };
  });

  const result = await matchPerson({
    person: aiPerson(state, refs, person),
    others: state.participants.filter((p) => p.id !== person.id).map((p) => p.name),
    items,
    current: mine.map((c) => ({ item: refs.itemRef.get(c.item_id)!, quantity: c.quantity, source: c.source })),
    latest,
  });

  const next = result.assignments
    .map((a) => {
      const item = refs.itemByRef.get(a.item);
      const avail = items.find((i) => i.ref === a.item)?.available ?? 0;
      const q = cleanQty(Math.min(a.quantity, avail));
      return item && q ? { item_id: item.id, quantity: q } : null;
    })
    .filter((x): x is { item_id: string; quantity: number } => !!x);

  const changed = await replaceClaims({
    sessionId: state.session.id,
    participantId: person.id,
    keepSources: ["split"],
    current: state.claims,
    next,
    source: "ai",
  });
  if (changed) await resetConfirmation([person.id]);

  // Alte offene Rückfragen dieser Person schließen, neue stellen
  await db()
    .from("messages")
    .update({ question_status: "dismissed" })
    .eq("session_id", state.session.id)
    .eq("recipient_id", person.id)
    .eq("kind", "question")
    .eq("question_status", "open");

  await postMessage({ session_id: state.session.id, kind: "ai", body: result.reply, recipient_id: person.id });
  for (const q of result.questions.slice(0, 3)) {
    const options = toOptions(refs, q.options);
    if (options.length === 0) continue;
    await postMessage({
      session_id: state.session.id,
      kind: "question",
      body: q.question,
      recipient_id: person.id,
      question_status: "open",
      meta: { options },
    });
  }
}

// ---------------------------------------------------------------------------
// Rückfrage beantworten
// ---------------------------------------------------------------------------

export async function answerQuestion(opts: {
  session: SessionRow;
  me: ParticipantRow;
  messageId: string;
  optionIndex: number;
}): Promise<void> {
  const { session, me, messageId, optionIndex } = opts;
  const { data: q } = await db()
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .eq("session_id", session.id)
    .maybeSingle();
  const question = q as MessageRow | null;
  if (!question || question.kind !== "question") throw new HttpError(404, "Rückfrage nicht gefunden");
  if (question.recipient_id !== me.id && !me.is_host) throw new HttpError(403, "Diese Frage ist nicht an dich.");
  if (question.question_status !== "open") throw new HttpError(409, "Diese Frage ist schon beantwortet.");
  const option = question.meta.options?.[optionIndex];
  if (!option) throw new HttpError(400, "Ungültige Antwort");
  const target = question.recipient_id!;

  // Antwort im Chat festhalten (dient der KI später als Kontext)
  await postMessage({
    session_id: session.id,
    kind: "user",
    participant_id: me.id,
    body: `↳ ${option.label}`,
    ai_status: "done",
    meta: { answer_to: question.id },
  });
  await db()
    .from("messages")
    .update({ question_status: "answered", meta: { ...question.meta, answer_label: option.label } })
    .eq("id", question.id);

  // Positionen könnten inzwischen gelöscht/ersetzt worden sein (neuer Bon) → nur noch existierende verwenden
  const { data: existing } = await db()
    .from("receipt_items")
    .select("id")
    .eq("session_id", session.id)
    .in("id", option.assignments.map((a) => a.item_id));
  const valid = new Set((existing ?? []).map((r) => r.id));
  const assignments = option.assignments.filter((a) => valid.has(a.item_id));
  if (assignments.length) {
    // Bewusste Antwort der Person → "manual", damit "Neu zuordnen" sie nicht wieder überschreibt
    const { error } = await db()
      .from("claims")
      .upsert(
        assignments.map((a) => ({
          session_id: session.id,
          participant_id: target,
          item_id: a.item_id,
          quantity: a.quantity,
          source: "manual" as const,
        })),
        { onConflict: "item_id,participant_id" },
      );
    if (error) throw error;
  }
  await resetConfirmation([target]);
}

// ---------------------------------------------------------------------------
// Kassenzettel verarbeiten
// ---------------------------------------------------------------------------

async function loadImage(path: string): Promise<ImageInput> {
  const { data, error } = await db().storage.from("photos").download(path);
  if (error || !data) throw error ?? new Error("Foto nicht gefunden");
  const buf = Buffer.from(await data.arrayBuffer());
  const type = data.type || "image/jpeg";
  return { dataUrl: `data:${type};base64,${buf.toString("base64")}` };
}

export async function processReceipt(sessionId: string): Promise<void> {
  try {
    const state = await loadRawState(sessionId);
    const images = await Promise.all(state.session.receipt_images.map(loadImage));
    const result = await parseReceipt(images);
    if (!result.is_receipt || result.items.length === 0) {
      await db()
        .from("sessions")
        .update({
          receipt_status: "error",
          receipt_error: "Auf dem Foto konnte ich keinen Kassenzettel erkennen. Probier ein schärferes Foto.",
        })
        .eq("id", sessionId);
      return;
    }

    // Alte Positionen (und damit Claims) ersetzen; Rückfragen zum alten Bon schließen
    await db().from("receipt_items").delete().eq("session_id", sessionId);
    await db()
      .from("messages")
      .update({ question_status: "dismissed" })
      .eq("session_id", sessionId)
      .eq("kind", "question")
      .eq("question_status", "open");
    const rows = result.items.map((it, i) => ({
      session_id: sessionId,
      position: i,
      name_original: it.name_original.slice(0, 200),
      name_de: it.name_de?.slice(0, 200) ?? null,
      quantity: it.quantity > 0 ? roundQty(it.quantity) : 1,
      total_price: Math.round(it.total_price * 100) / 100,
    }));
    const { error } = await db().from("receipt_items").insert(rows);
    if (error) throw error;

    const sum = rows.reduce((s, r) => s + r.total_price, 0);
    await db()
      .from("sessions")
      .update({
        receipt_status: "ready",
        receipt_error: null,
        receipt_total: result.receipt_total,
        restaurant_name: result.restaurant_name,
        status: state.session.status === "closed" ? "closed" : "assigning",
      })
      .eq("id", sessionId);

    const mismatch =
      result.receipt_total !== null && Math.abs(result.receipt_total - sum) > 0.01
        ? ` ⚠️ Die Positionen ergeben ${formatMoney(sum)}, auf dem Bon steht ${formatMoney(result.receipt_total)} – bitte kurz prüfen.`
        : "";
    await postMessage({
      session_id: sessionId,
      kind: "system",
      body: `🧾 Kassenzettel erkannt: ${rows.length} Positionen, ${formatMoney(sum)}.${mismatch}${
        result.warnings ? ` Hinweis: ${result.warnings}` : ""
      }`,
    });

    await notify(sessionId);
    if (state.notes.length > 0) await runMatchAll(sessionId);
  } catch (err) {
    console.error("processReceipt", err);
    await db()
      .from("sessions")
      .update({ receipt_status: "error", receipt_error: "Die KI konnte den Kassenzettel gerade nicht lesen." })
      .eq("id", sessionId);
  } finally {
    await notify(sessionId);
  }
}

// ---------------------------------------------------------------------------
// Alle zuordnen
// ---------------------------------------------------------------------------

export async function runMatchAll(sessionId: string): Promise<void> {
  try {
    await db().from("sessions").update({ match_status: "running", match_error: null }).eq("id", sessionId);
    await notify(sessionId);
    const state = await loadRawState(sessionId);
    if (state.items.length === 0) throw new HttpError(409, "Es gibt noch keine Positionen.");
    const refs = buildRefs(state);

    const fixed = state.claims
      .filter((c) => c.source !== "ai")
      .map((c) => ({ person: refs.personRef.get(c.participant_id)!, item: refs.itemRef.get(c.item_id)!, quantity: c.quantity }));
    const result = await matchAll({
      items: aiItems(state, refs),
      people: state.participants.map((p) => aiPerson(state, refs, p)),
      fixed,
    });

    // KI-Zuordnungen pro Person sammeln
    const perPerson = new Map<string, { item_id: string; quantity: number }[]>();
    for (const p of state.participants) perPerson.set(p.id, []);
    for (const a of result.assignments) {
      const person = refs.personByRef.get(a.person);
      const item = refs.itemByRef.get(a.item);
      const q = cleanQty(a.quantity);
      if (!person || !item || !q) continue;
      perPerson.get(person.id)!.push({ item_id: item.id, quantity: q });
    }

    const changedPeople: string[] = [];
    for (const [pid, next] of perPerson) {
      const changed = await replaceClaims({
        sessionId,
        participantId: pid,
        keepSources: ["manual", "split"],
        current: state.claims,
        next,
        source: "ai",
      });
      if (changed) changedPeople.push(pid);
    }
    await resetConfirmation(changedPeople);

    // Alte offene Rückfragen schließen, neue stellen
    await db()
      .from("messages")
      .update({ question_status: "dismissed" })
      .eq("session_id", sessionId)
      .eq("kind", "question")
      .eq("question_status", "open");

    await postMessage({ session_id: sessionId, kind: "ai", body: result.summary });
    for (const q of result.questions) {
      const person = refs.personByRef.get(q.person);
      const options = toOptions(refs, q.options);
      if (!person || options.length === 0) continue;
      await postMessage({
        session_id: sessionId,
        kind: "question",
        body: q.question,
        recipient_id: person.id,
        question_status: "open",
        meta: { options },
      });
    }

    await db()
      .from("sessions")
      .update({ match_status: "idle", matched_at: new Date().toISOString() })
      .eq("id", sessionId);
  } catch (err) {
    console.error("runMatchAll", err);
    await db()
      .from("sessions")
      .update({
        match_status: "error",
        match_error: err instanceof HttpError ? err.message : "Die KI-Zuordnung ist fehlgeschlagen.",
      })
      .eq("id", sessionId);
  } finally {
    await notify(sessionId);
  }
}

// ---------------------------------------------------------------------------
// Tellerfoto
// ---------------------------------------------------------------------------

export async function processPhoto(sessionId: string, messageId: string): Promise<void> {
  try {
    const { data } = await db().from("messages").select("*").eq("id", messageId).single();
    const message = data as MessageRow;
    if (!message.image_path) return;
    const image = await loadImage(message.image_path);
    const caption = message.body && message.body !== "📷" ? message.body : null;
    const result = await detectDishes(image, caption);
    const dishes: DetectedDish[] = result.dishes.slice(0, 12).map((d) => ({
      label: d.label.slice(0, 80),
      quantity: cleanQty(d.quantity) ?? 1,
      box: d.box
        ? {
            x: clamp01(d.box.x),
            y: clamp01(d.box.y),
            w: clamp01(d.box.w),
            h: clamp01(d.box.h),
          }
        : null,
      selected: d.belongs_to_person,
    }));
    await db()
      .from("messages")
      .update({ ai_status: "done", meta: { ...message.meta, dishes, photo_status: "review" } })
      .eq("id", messageId);
    await postMessage({
      session_id: sessionId,
      kind: "ai",
      body: `${result.reply} Tippe auf dem Foto weg, was nicht deins ist, und bestätige dann.`,
      recipient_id: message.participant_id,
    });
  } catch (err) {
    console.error("processPhoto", err);
    await db()
      .from("messages")
      .update({ ai_status: "error", meta: { photo_status: "error" } })
      .eq("id", messageId);
  } finally {
    await notify(sessionId);
  }
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

/** Bestätigte Speisen vom Foto als Notizen übernehmen. */
export async function confirmPhoto(opts: {
  session: SessionRow;
  me: ParticipantRow;
  messageId: string;
  selected: boolean[];
}): Promise<void> {
  const { session, me, messageId, selected } = opts;
  const { data } = await db()
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .eq("session_id", session.id)
    .maybeSingle();
  const message = data as MessageRow | null;
  if (!message || message.participant_id !== me.id) throw new HttpError(404, "Foto nicht gefunden");
  if (message.meta.photo_status !== "review") throw new HttpError(409, "Dieses Foto ist schon erledigt.");
  const dishes = (message.meta.dishes ?? []).map((d, i) => ({ ...d, selected: !!selected[i] }));
  const chosen = dishes.filter((d) => d.selected);

  await db()
    .from("messages")
    .update({ meta: { ...message.meta, dishes, photo_status: "confirmed" } })
    .eq("id", messageId);
  if (chosen.length) {
    const { error } = await db()
      .from("notes")
      .insert(
        chosen.map((d) => ({
          session_id: session.id,
          participant_id: me.id,
          message_id: messageId,
          description: d.label.replace(/\s*\(geteilt\?\)\s*/i, ""),
          quantity: d.quantity,
          variant: null,
          shared_with: [],
          source: "photo" as const,
        })),
      );
    if (error) throw error;
  }
  const list = chosen.map((d) => `${formatQty(d.quantity)}× ${d.label}`).join(", ");
  await postMessage({
    session_id: session.id,
    kind: "ai",
    body: chosen.length ? `Notiert vom Foto: ${list} 👍` : "Okay, vom Foto habe ich nichts übernommen.",
    recipient_id: me.id,
  });

  // Ist der Bon schon da, direkt zuordnen
  if (chosen.length && session.status === "assigning") {
    const state = await loadRawState(session.id);
    await rematchPerson(state, me, `Vom Foto: ${list}`);
  }
}
