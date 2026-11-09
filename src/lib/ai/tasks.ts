import "server-only";
import { env } from "@/lib/server/env";
import * as mock from "./mock";
import { structured, type ImageInput } from "./openai";
import {
  DishesResult,
  MatchAllResult,
  MatchPersonResult,
  NotesResult,
  ReceiptResult,
} from "./schemas";

// ---------------------------------------------------------------------------
// Eingaben (mit kurzen Referenzen I1, P1 … statt UUIDs – robuster für das Modell)
// ---------------------------------------------------------------------------

export interface AiItem {
  ref: string;
  name_original: string;
  name_de: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface AiNote {
  id?: string;
  description: string;
  quantity: number;
  variant: string | null;
  shared_with: string[];
}

export interface AiPerson {
  ref: string;
  name: string;
  notes: AiNote[];
  /** Chatverlauf dieser Person inkl. Rückfragen der KI und Antworten */
  chat: string[];
}

export interface NotesInput {
  author: string;
  message: string;
  participants: string[];
  existingNotes: (AiNote & { id: string })[];
  receiptItems: AiItem[];
  myTotal: string | null;
}

export interface MatchAllInput {
  items: AiItem[];
  people: AiPerson[];
  fixed: { person: string; item: string; quantity: number }[];
}

export interface MatchPersonInput {
  person: AiPerson;
  others: string[];
  items: (AiItem & { available: number })[];
  current: { item: string; quantity: number; source: string }[];
  latest: string;
}

const STYLE = `Antworte immer auf Deutsch, locker und kurz, in Du-Form. Beträge im Format 3,50 €.`;

// ---------------------------------------------------------------------------
// 1) Chat-Nachricht → Notizen
// ---------------------------------------------------------------------------

const NOTES_SYSTEM = `Du bist der Rechnungs-Assistent einer Gruppen-App, mit der eine Restaurantrechnung aufgeteilt wird.
Personen schreiben während oder nach dem Essen in den Chat, was sie gegessen und getrunken haben. Du machst daraus strukturierte Notizen.

Regeln:
- Nur was die schreibende Person selbst hatte. Schreibt sie über andere ("Anna hatte ein Bier"), trage das NICHT ein und bitte freundlich darum, dass die Person es selbst einträgt.
- Mengen erkennen: Ziffern und Zahlwörter ("zwei", "nen" = 1). "zwei Runden Ouzo" = 2. Ohne Menge: 1.
- Geteiltes: "Tzatziki mit Anna geteilt" → description "Tzatziki", quantity 1 (Anzahl des geteilten Gerichts, nicht der Anteil), shared_with ["Anna"]. "für alle"/"für den Tisch" → shared_with ["alle"].
- Größen/Varianten ("0,5", "groß", "klein", "Flasche", "weiß") in variant.
- Korrekturen ("doch nur ein Bier", "das Gyros war nicht meins"): passende bestehende Notiz-IDs in remove_note_ids, korrigierte Notiz in add.
- Sind Rechnungspositionen bekannt, verwende in description möglichst deren deutschen Namen.
- Enthält die Nachricht nichts zum Abrechnen: add = [], kurze hilfreiche Antwort. Fragen nach dem eigenen Betrag kannst du mit myTotal beantworten (falls vorhanden).
- reply: Bestätigung wie "Notiert: 2× Mythos (0,5 l) und 1× Gyros-Teller 👍". ${STYLE}`;

export async function extractNotes(input: NotesInput): Promise<NotesResult> {
  if (env.aiMock) return mock.extractNotes(input);
  return structured({
    model: env.openaiModelFast,
    effort: "low",
    system: NOTES_SYSTEM,
    user: JSON.stringify(input, null, 1),
    schema: NotesResult,
    name: "notes",
  });
}

// ---------------------------------------------------------------------------
// 2) Kassenzettel lesen
// ---------------------------------------------------------------------------

const RECEIPT_SYSTEM = `Du liest Kassenzettel und Rechnungen von Restaurants aus – oft aus Griechenland, mit griechischer Schrift, manchmal handschriftlich.
Mehrere Fotos können Teile DERSELBEN Rechnung zeigen: fasse sie zu einer Liste zusammen und zähle überlappende Zeilen nicht doppelt.

Regeln:
- Jede bezahlbare Zeile ist eine Position: Speisen, Getränke, Brot/Gedeck (ΚΟΥΒΕΡ, ΨΩΜΙ), Service-Zuschläge.
- NICHT aufnehmen: Zwischensummen, Endsumme (ΣΥΝΟΛΟ), MwSt./ΦΠΑ-Aufstellungen, Zahlungsart, Rückgeld, Tisch-/Kellner-/Belegnummern.
- quantity = Menge der Zeile, total_price = Zeilensumme. Steht nur Einzelpreis und Menge da, multipliziere. Dezimalkomma beachten (3,50 = 3.5).
- Rabatte/Gutschriften/Stornos als negative total_price.
- name_original exakt abschreiben (Originalsprache und -schrift beibehalten).
- name_de: kurze, verständliche deutsche Bezeichnung inkl. Größe/Menge, z. B. "Mythos Bier 0,5 l", "Griechischer Salat", "Hauswein weiß 1 l", "Gedeck/Brot".
- receipt_total: die auf dem Bon gedruckte Endsumme, falls lesbar.
- Prüfe am Ende, ob die Summe aller total_price zur Endsumme passt. Wenn nicht, prüfe Zeilen und Mengen erneut; bleibt eine Differenz, beschreibe sie in warnings.
- Ist auf den Fotos keine Rechnung zu sehen: is_receipt = false und items = [].`;

export async function parseReceipt(images: ImageInput[]): Promise<ReceiptResult> {
  if (env.aiMock) return mock.parseReceipt();
  return structured({
    model: env.openaiModel,
    effort: "medium",
    system: RECEIPT_SYSTEM,
    user: `Hier ${images.length === 1 ? "ist das Foto" : `sind ${images.length} Fotos`} der Rechnung. Lies alle Positionen aus.`,
    images,
    schema: ReceiptResult,
    name: "receipt",
  });
}

// ---------------------------------------------------------------------------
// 3) Zuordnung für alle
// ---------------------------------------------------------------------------

const MATCH_ALL_SYSTEM = `Du ordnest die Positionen einer Restaurantrechnung den Personen am Tisch zu.
Grundlage sind die Notizen und Chat-Nachrichten jeder Person, in denen sie beschrieben hat, was sie hatte. Die Rechnung ist oft griechisch – nutze name_original und name_de.
Ziel: möglichst viel sicher zuordnen und bei Unklarheiten gezielt die betroffene Person fragen.

Regeln:
1. Ordne nur zu, wenn klar ist, welche Position gemeint ist. Beispiel: Auf dem Bon stehen "Mythos 0,3 l" und "Mythos 0,5 l", die Person schrieb nur "2 Mythos" → Rückfrage mit Optionen (z. B. "2× 0,3 l", "2× 0,5 l", "je 1×"). Gibt es nur eine passende Position, ordne direkt zu.
2. Die Summe aller Zuordnungen einer Position (inklusive "fixed") darf deren quantity NICHT übersteigen. Geben Personen zusammen mehr an, als auf dem Bon steht, ordne nur das Sichere zu und frage die Beteiligten mit Mengen-Optionen, z. B. "Auf dem Bon stehen nur 4× Mythos 0,3 l, ihr habt zusammen 6 angegeben – wie viele hattest du?".
3. Geteiltes: Notizen mit shared_with werden aufgeteilt (2 Personen → je 0.5, 3 → je 0.3333). Nennen mehrere Personen dasselbe geteilte Gericht, nicht doppelt zählen. "alle" = alle Personen.
4. "fixed"-Zuordnungen stehen schon fest: nicht verändern, nicht nochmal zuordnen, aber bei der Mengenprüfung berücksichtigen.
5. Gedeck/Brot pro Person (z. B. ΚΟΥΒΕΡ mit Menge = Personenzahl): jeder Person 1 zuordnen. Andere Positionen, die niemand erwähnt hat, bleiben offen – dazu keine Rückfragen.
6. Rückfragen: höchstens eine pro Person und Thema. Nenne Positionen mit deutschem Namen und Größe/Preis. Jede Option enthält die konkreten assignments für diese Person (item + quantity). Wenn sinnvoll, biete eine Option "Nichts davon" mit leeren assignments an.
7. Verwende ausschließlich die gegebenen Referenzen (P…, I…).
8. summary: 1–2 lockere Sätze für die Gruppe, z. B. "Ich habe 14 von 18 Positionen zugeordnet. 2 Rückfragen sind raus, 3 Positionen hat noch niemand erwähnt." ${STYLE}`;

export async function matchAll(input: MatchAllInput): Promise<MatchAllResult> {
  if (env.aiMock) return mock.matchAll(input);
  return structured({
    model: env.openaiModel,
    effort: "medium",
    system: MATCH_ALL_SYSTEM,
    user: JSON.stringify(input, null, 1),
    schema: MatchAllResult,
    name: "match_all",
  });
}

// ---------------------------------------------------------------------------
// 4) Zuordnung für eine Person (nach neuer Nachricht / Antwort)
// ---------------------------------------------------------------------------

const MATCH_PERSON_SYSTEM = `Du kümmerst dich um die Positionen EINER Person auf einer Restaurantrechnung (oft griechisch – nutze name_original und name_de).
Du bekommst die Rechnungspositionen mit "available" (Menge, die für diese Person noch frei ist), die bisherigen Zuordnungen der Person ("current"), ihre Notizen und ihren Chatverlauf inklusive deiner früheren Rückfragen und ihrer Antworten. "latest" ist ihre neueste Nachricht.

Regeln:
- Gib in assignments die VOLLSTÄNDIGE neue Liste ihrer Positionen zurück (ersetzt "current").
- Behalte bestehende Zuordnungen bei, außer die neue Nachricht ändert oder widerlegt sie.
- quantity einer Position darf "available" nicht übersteigen. Will die Person mehr, als frei ist, ordne das Mögliche zu und erkläre in reply, dass andere den Rest schon übernommen haben.
- Geteiltes anteilig zuordnen (mit einer weiteren Person → 0.5).
- Ist weiterhin unklar, welche Position gemeint ist: Rückfrage mit 2–4 konkreten Optionen (jede Option = konkrete assignments für diese Person, die zusätzlich zu den übrigen gelten).
- Verwende ausschließlich die gegebenen Referenzen (I…).
- reply: kurze Bestätigung, was jetzt bei ihr steht oder was du geändert hast. ${STYLE}`;

export async function matchPerson(input: MatchPersonInput): Promise<MatchPersonResult> {
  if (env.aiMock) return mock.matchPerson(input);
  return structured({
    model: env.openaiModel,
    effort: "low",
    system: MATCH_PERSON_SYSTEM,
    user: JSON.stringify(input, null, 1),
    schema: MatchPersonResult,
    name: "match_person",
  });
}

// ---------------------------------------------------------------------------
// 5) Tellerfoto analysieren
// ---------------------------------------------------------------------------

const DISHES_SYSTEM = `Eine Person hat im Restaurant ein Foto von ihrem Essen bzw. ihrem Platz gemacht. Erkenne alle Speisen und Getränke darauf.
- Markiere jedes erkannte Teil mit einer Bounding Box (x, y, w, h relativ zur Bildgröße, Werte 0..1, Ursprung oben links). Wenn du die Position nicht sinnvoll angeben kannst: box = null.
- belongs_to_person = true für das, was auf dem Teller/Platz der Person im Vordergrund bzw. in der Bildmitte steht. false für Dinge, die erkennbar zu anderen Plätzen gehören (Bildrand, Hintergrund, fremde Teller). Gemeinsame Platten in der Tischmitte: false und im label "(geteilt?)" ergänzen.
- label: kurzer deutscher Name (z. B. "Gyros-Teller", "Mythos Bier 0,5 l", "Griechischer Salat").
- quantity: Anzahl gleicher Teile (z. B. 2 Bierflaschen = 2).
- reply: ein kurzer Satz, was du als ihres erkannt hast. ${STYLE}`;

export async function detectDishes(image: ImageInput, caption: string | null): Promise<DishesResult> {
  if (env.aiMock) return mock.detectDishes();
  return structured({
    model: env.openaiModel,
    effort: "low",
    system: DISHES_SYSTEM,
    user: caption ? `Bildunterschrift der Person: "${caption}"` : "Was ist auf meinem Teller?",
    images: [image],
    schema: DishesResult,
    name: "dishes",
  });
}
