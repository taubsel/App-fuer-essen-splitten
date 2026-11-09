// Qualitätsprüfung der echten KI. Läuft NICHT bei `npm test`, sondern mit `npm run eval:ai`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectDishes, extractNotes, matchAll, matchPerson, parseReceipt, type AiItem } from "./tasks";

function image(file: string) {
  const buf = readFileSync(path.join(process.cwd(), "e2e", "fixtures", file));
  return { dataUrl: `data:image/jpeg;base64,${buf.toString("base64")}` };
}

const ITEMS: AiItem[] = [
  { ref: "I1", name_original: "ΜΥΘΟΣ 330ML", name_de: "Mythos Bier 0,33 l", quantity: 4, unit_price: 3.5, total_price: 14 },
  { ref: "I2", name_original: "ΜΥΘΟΣ 500ML", name_de: "Mythos Bier 0,5 l", quantity: 2, unit_price: 5, total_price: 10 },
  { ref: "I3", name_original: "ΓΥΡΟΣ ΧΟΙΡΙΝΟ ΠΙΑΤΟ", name_de: "Gyros-Teller (Schwein)", quantity: 1, unit_price: 12.5, total_price: 12.5 },
  { ref: "I4", name_original: "ΧΩΡΙΑΤΙΚΗ", name_de: "Griechischer Salat", quantity: 1, unit_price: 9, total_price: 9 },
  { ref: "I5", name_original: "ΤΖΑΤΖΙΚΙ", name_de: "Tzatziki", quantity: 1, unit_price: 5, total_price: 5 },
  { ref: "I6", name_original: "ΣΟΥΒΛΑΚΙ ΚΟΤΟΠΟΥΛΟ", name_de: "Hähnchen-Souvlaki", quantity: 2, unit_price: 11, total_price: 22 },
  { ref: "I7", name_original: "ΚΟΥΒΕΡ", name_de: "Gedeck/Brot", quantity: 3, unit_price: 1, total_price: 3 },
];

const sumFor = (as: { person?: string; item: string; quantity: number }[], person: string | null, item: string) =>
  as.filter((a) => (person === null || a.person === person) && a.item === item).reduce((s, a) => s + a.quantity, 0);

describe("Kassenzettel lesen", () => {
  it("liest den griechischen Bon vollständig und korrekt", async () => {
    const r = await parseReceipt([image("receipt-greek.jpg")]);
    console.log(JSON.stringify(r, null, 1));
    expect(r.is_receipt).toBe(true);
    expect(r.items).toHaveLength(7);
    expect(r.receipt_total).toBeCloseTo(75.5, 2);
    expect(r.items.reduce((s, i) => s + i.total_price, 0)).toBeCloseTo(75.5, 2);
    const small = r.items.find((i) => i.name_original.includes("330"));
    expect(small?.quantity).toBe(4);
    expect(small?.total_price).toBeCloseTo(14, 2);
    expect(small?.name_de.toLowerCase()).toContain("mythos");
  });
});

describe("Chat-Nachrichten verstehen", () => {
  it("Mengen, Größen und Geteiltes", async () => {
    const r = await extractNotes({
      author: "Anna",
      message: "Hatte 2 Mythos (die großen) und nen Gyros Teller, Tzatziki mit Ben geteilt",
      participants: ["Anna", "Ben", "Julian"],
      existingNotes: [],
      receiptItems: [],
      myTotal: null,
    });
    console.log(JSON.stringify(r));
    const mythos = r.add.find((n) => /mythos/i.test(n.description));
    expect(mythos?.quantity).toBe(2);
    expect(mythos?.variant).toBeTruthy();
    expect(r.add.find((n) => /gyros/i.test(n.description))?.quantity).toBe(1);
    expect(r.add.find((n) => /tzatziki/i.test(n.description))?.shared_with).toContain("Ben");
  });

  it("Korrekturen ersetzen alte Notizen", async () => {
    const r = await extractNotes({
      author: "Ben",
      message: "Sorry, war doch nur ein Mythos, nicht zwei",
      participants: ["Anna", "Ben"],
      existingNotes: [{ id: "n1", description: "Mythos Bier", quantity: 2, variant: null, shared_with: [] }],
      receiptItems: [],
      myTotal: null,
    });
    console.log(JSON.stringify(r));
    expect(r.remove_note_ids).toContain("n1");
    expect(r.add.find((n) => /mythos/i.test(n.description))?.quantity).toBe(1);
  });

  it("trägt nichts für andere Personen ein", async () => {
    const r = await extractNotes({
      author: "Ben",
      message: "Anna hatte übrigens noch einen Ouzo",
      participants: ["Anna", "Ben"],
      existingNotes: [],
      receiptItems: [],
      myTotal: null,
    });
    console.log(JSON.stringify(r));
    expect(r.add).toHaveLength(0);
  });
});

describe("Zuordnung", () => {
  it("ordnet Eindeutiges zu und fragt bei der Mythos-Größe nach", async () => {
    const r = await matchAll({
      items: ITEMS,
      people: [
        {
          ref: "P1",
          name: "Anna",
          notes: [
            { description: "Mythos", quantity: 2, variant: null, shared_with: [] },
            { description: "Tzatziki", quantity: 1, variant: null, shared_with: ["Ben"] },
          ],
          chat: ["Person: 2 Mythos und Tzatziki mit Ben geteilt"],
        },
        {
          ref: "P2",
          name: "Ben",
          notes: [
            { description: "Gyros Teller", quantity: 1, variant: null, shared_with: [] },
            { description: "Mythos", quantity: 1, variant: "0,5 l", shared_with: [] },
          ],
          chat: ["Person: Gyros Teller, 1 Mythos 0,5"],
        },
        {
          ref: "P3",
          name: "Julian",
          notes: [
            { description: "Souvlaki", quantity: 1, variant: null, shared_with: [] },
            { description: "Griechischer Salat", quantity: 1, variant: null, shared_with: [] },
          ],
          chat: ["Person: Souvlaki und Griechischer Salat"],
        },
      ],
      fixed: [],
    });
    console.log(JSON.stringify(r, null, 1));
    expect(sumFor(r.assignments, "P2", "I3")).toBe(1);
    expect(sumFor(r.assignments, "P2", "I2")).toBe(1);
    expect(sumFor(r.assignments, "P1", "I5")).toBeCloseTo(0.5, 2);
    expect(sumFor(r.assignments, "P2", "I5")).toBeCloseTo(0.5, 2);
    expect(sumFor(r.assignments, "P3", "I6")).toBe(1);
    expect(sumFor(r.assignments, "P3", "I4")).toBe(1);
    expect(sumFor(r.assignments, null, "I7")).toBe(3);
    const q = r.questions.find((x) => x.person === "P1");
    expect(q).toBeTruthy();
    expect(q!.options.length).toBeGreaterThanOrEqual(2);
  });

  it("überbucht nicht, sondern fragt nach", async () => {
    const people = ["Anna", "Ben", "Cem"].map((name, i) => ({
      ref: `P${i + 1}`,
      name,
      notes: [{ description: "Mythos klein", quantity: 2, variant: "0,33 l", shared_with: [] }],
      chat: ["Person: 2 kleine Mythos"],
    }));
    const r = await matchAll({ items: ITEMS, people, fixed: [] });
    console.log(JSON.stringify(r, null, 1));
    expect(sumFor(r.assignments, null, "I1")).toBeLessThanOrEqual(4);
    expect(r.questions.length).toBeGreaterThanOrEqual(1);
  });

  it("verarbeitet eine Freitext-Antwort auf eine Rückfrage", async () => {
    const r = await matchPerson({
      person: {
        ref: "P1",
        name: "Anna",
        notes: [{ description: "Mythos", quantity: 2, variant: null, shared_with: [] }],
        chat: [
          "Person: 2 Mythos",
          "KI-Rückfrage: Welche Mythos hattest du? (Optionen: 2× 0,33 l | 2× 0,5 l) [offen]",
          "Person: die kleinen",
        ],
      },
      others: ["Ben"],
      items: ITEMS.map((i) => ({ ...i, available: i.quantity })),
      current: [],
      latest: "die kleinen",
    });
    console.log(JSON.stringify(r, null, 1));
    expect(sumFor(r.assignments, null, "I1")).toBe(2);
    expect(sumFor(r.assignments, null, "I2")).toBe(0);
  });
});

describe("Tellerfoto", () => {
  it("erkennt den eigenen Teller und lässt den fremden weg", async () => {
    const r = await detectDishes(image("plate.jpg"), null);
    console.log(JSON.stringify(r, null, 1));
    const food = /gyros|pita|döner|wrap|souvlaki/i;
    const mine = r.dishes.filter((d) => d.belongs_to_person);
    expect(mine.some((d) => food.test(d.label))).toBe(true);
    const fries = r.dishes.find((d) => /pommes|fritten/i.test(d.label));
    if (fries) expect(fries.belongs_to_person).toBe(false);
    const gyros = mine.find((d) => food.test(d.label));
    if (gyros?.box) {
      // Box sollte grob in der Bildmitte liegen
      expect(gyros.box.x + gyros.box.w / 2).toBeGreaterThan(0.3);
      expect(gyros.box.x + gyros.box.w / 2).toBeLessThan(0.7);
    }
  });
});
