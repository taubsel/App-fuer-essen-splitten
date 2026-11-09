import { describe, expect, it } from "vitest";
import { computeSettlement, distributeCents, formatQty, splitRemaining } from "./calc";
import type { ClaimRow, ItemRow } from "./types";

function item(id: string, quantity: number, total: number): ItemRow {
  return {
    id,
    session_id: "s",
    position: 0,
    name_original: id,
    name_de: id,
    quantity,
    total_price: total,
    created_at: "",
  };
}

function claim(item_id: string, participant_id: string, quantity: number): ClaimRow {
  return {
    id: `${item_id}-${participant_id}`,
    session_id: "s",
    item_id,
    participant_id,
    quantity,
    source: "manual",
    created_at: "",
    updated_at: "",
  };
}

const people = [{ id: "anna" }, { id: "ben" }, { id: "cem" }];

describe("computeSettlement", () => {
  it("rechnet Anteile, Trinkgeld und offene Beträge", () => {
    const items = [item("mythos", 4, 14), item("gyros", 1, 12.5), item("tzatziki", 1, 5)];
    const claims = [
      claim("mythos", "anna", 2),
      claim("mythos", "ben", 1),
      claim("gyros", "ben", 1),
      claim("tzatziki", "anna", 0.5),
      claim("tzatziki", "ben", 0.5),
    ];
    const s = computeSettlement({ items, claims, participants: people, tipPercent: 10 });

    expect(s.participants.anna.subtotal).toBe(9.5); // 2×3,50 + 2,50
    expect(s.participants.anna.tip).toBe(0.95);
    expect(s.participants.anna.total).toBe(10.45);
    expect(s.participants.ben.subtotal).toBe(18.5); // 3,50 + 12,50 + 2,50
    expect(s.participants.cem.total).toBe(0);
    expect(s.items.mythos.remaining).toBe(1);
    expect(s.openSum).toBe(3.5);
    expect(s.receiptSum).toBe(31.5);
    expect(s.progress).toBeCloseTo(28 / 31.5);
    expect(s.overAssignedItemIds).toEqual([]);
  });

  it("erkennt Überbuchung", () => {
    const items = [item("mythos", 4, 14)];
    const claims = [claim("mythos", "anna", 3), claim("mythos", "ben", 3)];
    const s = computeSettlement({ items, claims, participants: people, tipPercent: 0 });
    expect(s.items.mythos.over).toBe(true);
    expect(s.overAssignedItemIds).toEqual(["mythos"]);
    expect(s.openSum).toBe(0);
  });

  it("verteilt Rabatte anteilig", () => {
    const items = [item("a", 1, 30), item("b", 1, 10), item("rabatt", 1, -4)];
    const claims = [claim("a", "anna", 1), claim("b", "ben", 1)];
    const s = computeSettlement({ items, claims, participants: people, tipPercent: 0 });
    expect(s.participants.anna.adjustments).toBe(-3);
    expect(s.participants.ben.adjustments).toBe(-1);
    expect(s.participants.anna.total).toBe(27);
    expect(s.participants.ben.total).toBe(9);
    expect(s.openSum).toBe(0);
  });
});

describe("centgenaue Rundung", () => {
  it("Drittel ergeben in Summe exakt den Rechnungsbetrag", () => {
    const items = [item("platte", 1, 10)];
    const claims = [claim("platte", "anna", 1 / 3), claim("platte", "ben", 1 / 3), claim("platte", "cem", 1 / 3)];
    const s = computeSettlement({ items, claims, participants: people, tipPercent: 10 });
    const totals = ["anna", "ben", "cem"].map((p) => s.participants[p].total);
    expect(totals.reduce((a, b) => a + b, 0)).toBeCloseTo(11, 10);
    expect(s.assignedSum).toBe(10);
    expect(new Set(totals.map((t) => Math.round(t * 100))).size).toBeLessThanOrEqual(2);
  });

  it("distributeCents verteilt Restcents nach größtem Rest", () => {
    expect(distributeCents([3.333, 3.333, 3.334])).toEqual([3.33, 3.33, 3.34]);
    expect(distributeCents([0.005, 0.005])).toEqual([0.01, 0]);
  });
});

describe("splitRemaining", () => {
  it("teilt offene Mengen gleichmäßig auf und addiert zu bestehenden Anteilen", () => {
    const items = [item("brot", 1, 3), item("mythos", 4, 14)];
    const claims = [claim("mythos", "anna", 2), claim("mythos", "ben", 1)];
    const res = splitRemaining({ items, claims, participantIds: ["anna", "ben"] });
    expect(res).toContainEqual({ item_id: "brot", participant_id: "anna", quantity: 0.5 });
    expect(res).toContainEqual({ item_id: "brot", participant_id: "ben", quantity: 0.5 });
    expect(res).toContainEqual({ item_id: "mythos", participant_id: "anna", quantity: 2.5 });
    expect(res).toContainEqual({ item_id: "mythos", participant_id: "ben", quantity: 1.5 });
  });
});

describe("formatQty", () => {
  it("zeigt Brüche lesbar an", () => {
    expect(formatQty(2)).toBe("2");
    expect(formatQty(0.5)).toBe("½");
    expect(formatQty(1.5)).toBe("1½");
    expect(formatQty(1 / 3)).toBe("⅓");
    expect(formatQty(0.4)).toBe("0,4");
  });
});
