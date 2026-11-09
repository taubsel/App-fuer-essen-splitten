import { z } from "zod";

// Alle Felder sind Pflicht (OpenAI Structured Outputs, strict). Optionales => nullable.

// ---------------------------------------------------------------------------
// 1) Chat-Nachricht → Notizen
// ---------------------------------------------------------------------------
export const NotesResult = z.object({
  intent: z
    .enum(["log", "correction", "question", "other"])
    .describe("log = neue Sachen, correction = Korrektur früherer Angaben, question = Frage, other = sonstiges"),
  add: z
    .array(
      z.object({
        description: z.string().describe("Was gegessen/getrunken wurde, kurz, z. B. 'Mythos Bier'"),
        quantity: z.number().describe("Anzahl, z. B. 2. Bei 'die Hälfte' 0.5"),
        variant: z.string().nullable().describe("Größe/Variante falls genannt, z. B. '0,5 l', sonst null"),
        shared_with: z.array(z.string()).describe("Namen der Personen, mit denen es geteilt wurde"),
      }),
    )
    .describe("Neu hinzuzufügende Notizen"),
  remove_note_ids: z.array(z.string()).describe("IDs bestehender Notizen, die laut Nachricht falsch sind"),
  reply: z.string().describe("Kurze, freundliche Antwort auf Deutsch (max. 2 Sätze)"),
});
export type NotesResult = z.infer<typeof NotesResult>;

// ---------------------------------------------------------------------------
// 2) Kassenzettel-Foto(s) → Positionen
// ---------------------------------------------------------------------------
export const ReceiptResult = z.object({
  is_receipt: z.boolean().describe("false, wenn auf den Fotos kein Kassenzettel zu erkennen ist"),
  restaurant_name: z.string().nullable(),
  currency: z.string().describe("ISO-Währungscode, z. B. EUR"),
  items: z.array(
    z.object({
      name_original: z.string().describe("Text der Position genau wie auf dem Bon (Originalsprache)"),
      name_de: z.string().describe("Kurze deutsche Übersetzung/Erklärung, z. B. 'Schweinesouvlaki'"),
      quantity: z.number().describe("Menge der Zeile"),
      total_price: z.number().describe("Zeilensumme (Menge × Einzelpreis), Rabatte negativ"),
    }),
  ),
  receipt_total: z.number().nullable().describe("Gesamtbetrag laut Bon, falls lesbar"),
  warnings: z.string().nullable().describe("Hinweise auf unleserliche oder unsichere Stellen, sonst null"),
});
export type ReceiptResult = z.infer<typeof ReceiptResult>;

// ---------------------------------------------------------------------------
// 3) Zuordnung (alle Personen bzw. eine Person)
// ---------------------------------------------------------------------------
const Assignment = z.object({
  person: z.string().describe("Personen-Referenz, z. B. P1"),
  item: z.string().describe("Positions-Referenz, z. B. I3"),
  quantity: z.number().describe("Anzahl Einheiten; Bruchteile bei geteilten Sachen, z. B. 0.5"),
});

const Question = z.object({
  person: z.string().describe("An wen geht die Rückfrage (z. B. P2)"),
  question: z.string().describe("Kurze Rückfrage auf Deutsch in Du-Form"),
  options: z
    .array(
      z.object({
        label: z.string().describe("Kurzer Button-Text, z. B. '2× Mythos 0,3 l'"),
        assignments: z.array(z.object({ item: z.string(), quantity: z.number() })),
      }),
    )
    .describe("2–4 konkrete Antwortmöglichkeiten; jede legt die genannten Zuordnungen für die Person fest"),
});

export const MatchAllResult = z.object({
  assignments: z.array(Assignment),
  questions: z.array(Question),
  summary: z.string().describe("1–2 Sätze für den Gruppenchat, was zugeordnet wurde und was offen ist"),
});
export type MatchAllResult = z.infer<typeof MatchAllResult>;

export const MatchPersonResult = z.object({
  assignments: z
    .array(z.object({ item: z.string(), quantity: z.number() }))
    .describe("VOLLSTÄNDIGE Liste der Positionen dieser Person (ersetzt die bisherige Zuordnung)"),
  questions: z.array(Question.omit({ person: true })),
  reply: z.string().describe("Kurze Antwort an die Person auf Deutsch"),
});
export type MatchPersonResult = z.infer<typeof MatchPersonResult>;

// ---------------------------------------------------------------------------
// 4) Tellerfoto → erkannte Speisen
// ---------------------------------------------------------------------------
export const DishesResult = z.object({
  dishes: z.array(
    z.object({
      label: z.string().describe("Deutscher Name der Speise/des Getränks"),
      quantity: z.number(),
      box: z
        .object({
          x: z.number().describe("linke Kante, 0..1 relativ zur Bildbreite"),
          y: z.number().describe("obere Kante, 0..1 relativ zur Bildhöhe"),
          w: z.number().describe("Breite, 0..1"),
          h: z.number().describe("Höhe, 0..1"),
        })
        .nullable(),
      belongs_to_person: z
        .boolean()
        .describe("true, wenn es zum Teller/Platz der fotografierenden Person gehört (Vordergrund/Mitte)"),
    }),
  ),
  reply: z.string().describe("Kurzer Satz auf Deutsch, was erkannt wurde"),
});
export type DishesResult = z.infer<typeof DishesResult>;
