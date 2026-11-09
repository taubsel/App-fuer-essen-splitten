// Deterministische Fake-KI für Tests und Entwicklung ohne OpenAI (AI_MOCK=1).
// Sie ist absichtlich simpel – sie soll nur plausible Antworten im richtigen Format liefern.

import type {
  DishesResult,
  MatchAllResult,
  MatchPersonResult,
  NotesResult,
  ReceiptResult,
} from "./schemas";
import type { AiItem, AiNote, MatchAllInput, MatchPersonInput, NotesInput } from "./tasks";

const NUMBER_WORDS: Record<string, number> = {
  ein: 1, eine: 1, einen: 1, nen: 1, "'n": 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6,
};

export function parseNotes(text: string): AiNote[] {
  const notes: AiNote[] = [];
  const parts = text
    .split(/,(?!\d)|;|\+|\bund\b|\bsowie\b/i)
    .map((p) => p.trim())
    .filter(Boolean);
  for (let part of parts) {
    let shared: string[] = [];
    const sharedMatch = part.match(/mit (\p{L}+) geteilt/iu);
    if (sharedMatch) {
      shared = [sharedMatch[1]];
      part = part.replace(sharedMatch[0], "").trim();
    }
    part = part.replace(/^(ich hatte|hatte|ich hab|hab|ich habe)\s+/i, "");
    let variant: string | null = null;
    const v = part.match(/0[,.]\d+\s*l?/i);
    if (v) {
      variant = v[0].replace(".", ",").replace(/\s*l?$/i, " l");
      part = part.replace(v[0], "").trim();
    }
    const m = part.match(/^(\d+(?:[.,]\d+)?|\p{L}+)?\s*(?:x|×)?\s*(.+)$/iu);
    if (!m) continue;
    let quantity = 1;
    let description = part;
    if (m[1] && /^\d/.test(m[1])) {
      quantity = Number(m[1].replace(",", "."));
      description = m[2];
    } else if (m[1] && NUMBER_WORDS[m[1].toLowerCase()]) {
      quantity = NUMBER_WORDS[m[1].toLowerCase()];
      description = m[2];
    }
    description = description.replace(/[.!?]+$/, "").trim();
    if (description.length < 2) continue;
    notes.push({ description, quantity, variant, shared_with: shared });
  }
  return notes;
}

export function extractNotes(input: NotesInput): NotesResult {
  const add = parseNotes(input.message);
  if (add.length === 0) {
    return {
      intent: "other",
      add: [],
      remove_note_ids: [],
      reply: input.myTotal ? `Dein aktueller Stand: ${input.myTotal}.` : "Alles klar! Schreib einfach, was du hattest.",
    };
  }
  const list = add.map((n) => `${n.quantity}× ${n.description}${n.variant ? ` (${n.variant})` : ""}`).join(", ");
  return { intent: "log", add, remove_note_ids: [], reply: `Notiert: ${list} 👍` };
}

export function parseReceipt(): ReceiptResult {
  return {
    is_receipt: true,
    restaurant_name: "Taverna Testos",
    currency: "EUR",
    items: [
      { name_original: "ΜΥΘΟΣ 330ML", name_de: "Mythos Bier 0,3 l", quantity: 4, total_price: 14 },
      { name_original: "ΜΥΘΟΣ 500ML", name_de: "Mythos Bier 0,5 l", quantity: 2, total_price: 10 },
      { name_original: "ΓΥΡΟΣ ΧΟΙΡΙΝΟ ΠΙΑΤΟ", name_de: "Gyros-Teller (Schwein)", quantity: 1, total_price: 12.5 },
      { name_original: "ΧΩΡΙΑΤΙΚΗ", name_de: "Griechischer Salat", quantity: 1, total_price: 9 },
      { name_original: "ΤΖΑΤΖΙΚΙ", name_de: "Tzatziki", quantity: 1, total_price: 5 },
      { name_original: "ΣΟΥΒΛΑΚΙ ΚΟΤΟΠΟΥΛΟ", name_de: "Hähnchen-Souvlaki", quantity: 2, total_price: 22 },
      { name_original: "ΚΟΥΒΕΡ", name_de: "Gedeck/Brot", quantity: 3, total_price: 3 },
    ],
    receipt_total: 75.5,
    warnings: null,
  };
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\d,]+/gu, " ")
    .split(" ")
    .filter((w) => w.length >= 4);
}

function candidates(note: AiNote, items: AiItem[]): AiItem[] {
  const noteWords = words(note.description);
  let found = items.filter((it) => {
    const name = `${it.name_de ?? ""} ${it.name_original}`.toLowerCase();
    return noteWords.some((w) => name.includes(w));
  });
  if (note.variant && found.length > 1) {
    const v = note.variant.replace(/\s*l$/, "").trim();
    const narrowed = found.filter((it) => (it.name_de ?? "").includes(v));
    if (narrowed.length > 0) found = narrowed;
  }
  return found;
}

export function matchAll(input: MatchAllInput): MatchAllResult {
  const used = new Map<string, number>();
  for (const f of input.fixed) used.set(f.item, (used.get(f.item) ?? 0) + f.quantity);
  const assignments: MatchAllResult["assignments"] = [];
  const questions: MatchAllResult["questions"] = [];
  const assign = (person: string, item: AiItem, quantity: number) => {
    const free = item.quantity - (used.get(item.ref) ?? 0);
    const q = Math.min(quantity, free);
    if (q <= 0) return false;
    used.set(item.ref, (used.get(item.ref) ?? 0) + q);
    const existing = assignments.find((a) => a.person === person && a.item === item.ref);
    if (existing) existing.quantity += q;
    else assignments.push({ person, item: item.ref, quantity: q });
    return true;
  };

  for (const person of input.people) {
    for (const note of person.notes) {
      const found = candidates(note, input.items);
      if (found.length === 1) {
        const share = note.shared_with.length > 0 ? note.quantity / (note.shared_with.length + 1) : note.quantity;
        if (!assign(person.ref, found[0], share)) {
          questions.push({
            person: person.ref,
            question: `Auf dem Bon ist „${found[0].name_de}“ schon komplett vergeben. Hattest du das wirklich?`,
            options: [
              { label: `Ja, 1× ${found[0].name_de}`, assignments: [{ item: found[0].ref, quantity: 1 }] },
              { label: "Nein, war ein Fehler", assignments: [] },
            ],
          });
        }
        for (const name of note.shared_with) {
          const partner = input.people.find((p) => p.name.toLowerCase() === name.toLowerCase());
          const already = assignments.some((a) => a.person === partner?.ref && a.item === found[0].ref);
          if (partner && !already) assign(partner.ref, found[0], share);
        }
      } else if (found.length > 1) {
        questions.push({
          person: person.ref,
          question: `Du hattest ${note.quantity}× ${note.description} – welche Position auf dem Bon war das?`,
          options: found.slice(0, 3).map((it) => ({
            label: `${note.quantity}× ${it.name_de}`,
            assignments: [{ item: it.ref, quantity: note.quantity }],
          })),
        });
      }
    }
  }

  // Gedeck pro Person
  for (const item of input.items) {
    if (/gedeck|κουβερ/i.test(`${item.name_de} ${item.name_original}`) && item.quantity === input.people.length) {
      for (const p of input.people) assign(p.ref, item, 1);
    }
  }

  const assignedItems = new Set(assignments.map((a) => a.item)).size;
  return {
    assignments,
    questions,
    summary: `Ich habe ${assignedItems} von ${input.items.length} Positionen zugeordnet${
      questions.length ? ` und ${questions.length} Rückfrage${questions.length > 1 ? "n" : ""} gestellt` : ""
    }.`,
  };
}

export function matchPerson(input: MatchPersonInput): MatchPersonResult {
  const result = new Map<string, number>();
  for (const c of input.current) result.set(c.item, c.quantity);
  const latestNotes = parseNotes(input.latest);
  const questions: MatchPersonResult["questions"] = [];
  const changed: string[] = [];
  for (const note of latestNotes) {
    const found = candidates(note, input.items);
    if (found.length === 1) {
      const item = input.items.find((i) => i.ref === found[0].ref)!;
      const q = Math.min(note.quantity, item.available);
      if (q > 0) {
        result.set(item.ref, q);
        changed.push(`${q}× ${item.name_de}`);
      }
    } else if (found.length > 1) {
      questions.push({
        question: `Welche Position meinst du mit „${note.description}“?`,
        options: found.slice(0, 3).map((it) => ({
          label: `${note.quantity}× ${it.name_de}`,
          assignments: [{ item: it.ref, quantity: note.quantity }],
        })),
      });
    }
  }
  return {
    assignments: [...result.entries()].map(([item, quantity]) => ({ item, quantity })),
    questions,
    reply: changed.length ? `Alles klar, eingetragen: ${changed.join(", ")}.` : "Okay, ich habe nichts geändert.",
  };
}

export function detectDishes(): DishesResult {
  return {
    dishes: [
      { label: "Gyros-Teller", quantity: 1, box: { x: 0.25, y: 0.3, w: 0.5, h: 0.45 }, belongs_to_person: true },
      { label: "Mythos Bier 0,5 l", quantity: 1, box: { x: 0.72, y: 0.05, w: 0.2, h: 0.4 }, belongs_to_person: true },
      { label: "Pommes (geteilt?)", quantity: 1, box: { x: 0.0, y: 0.0, w: 0.22, h: 0.25 }, belongs_to_person: false },
    ],
    reply: "Ich sehe einen Gyros-Teller und ein Mythos. Die Pommes oben links gehören wohl nicht dir.",
  };
}
