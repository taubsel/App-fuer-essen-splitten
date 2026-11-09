// Reine Rechenlogik für die Abrechnung – ohne Datenbank, gut testbar.

import type { ClaimRow, ItemRow, ParticipantRow } from "./types";

export const EPSILON = 1e-6;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function unitPrice(item: Pick<ItemRow, "quantity" | "total_price">): number {
  return item.quantity > 0 ? item.total_price / item.quantity : item.total_price;
}

export function isAdjustment(item: Pick<ItemRow, "total_price">): boolean {
  return item.total_price < 0;
}

export interface ItemStat {
  itemId: string;
  quantity: number;
  assigned: number;
  remaining: number;
  /** mehr zugeordnet als auf dem Bon steht */
  over: boolean;
  unitPrice: number;
  /** Rabatte/negative Positionen werden anteilig verteilt, nicht zugeordnet */
  adjustment: boolean;
  /** offener Betrag dieser Position */
  openAmount: number;
}

export interface ParticipantLine {
  itemId: string;
  quantity: number;
  amount: number;
}

export interface ParticipantTotal {
  participantId: string;
  lines: ParticipantLine[];
  subtotal: number;
  /** Anteil an Rabatten (negativ) */
  adjustments: number;
  tip: number;
  total: number;
}

export interface Settlement {
  items: Record<string, ItemStat>;
  participants: Record<string, ParticipantTotal>;
  receiptSum: number;
  assignedSum: number;
  openSum: number;
  tipSum: number;
  grandTotal: number;
  overAssignedItemIds: string[];
  /** Anteil der Rechnung, der schon zugeordnet ist (0..1) */
  progress: number;
}

export function computeSettlement(input: {
  items: ItemRow[];
  claims: ClaimRow[];
  participants: Pick<ParticipantRow, "id">[];
  tipPercent: number;
}): Settlement {
  const { items, claims, participants, tipPercent } = input;
  const itemById = new Map(items.map((i) => [i.id, i]));
  const tipFactor = Math.max(0, tipPercent) / 100;

  const stats: Record<string, ItemStat> = {};
  for (const item of items) {
    stats[item.id] = {
      itemId: item.id,
      quantity: item.quantity,
      assigned: 0,
      remaining: item.quantity,
      over: false,
      unitPrice: unitPrice(item),
      adjustment: isAdjustment(item),
      openAmount: 0,
    };
  }

  const totals: Record<string, ParticipantTotal> = {};
  for (const p of participants) {
    totals[p.id] = { participantId: p.id, lines: [], subtotal: 0, adjustments: 0, tip: 0, total: 0 };
  }

  for (const claim of claims) {
    const item = itemById.get(claim.item_id);
    const stat = stats[claim.item_id];
    const pt = totals[claim.participant_id];
    if (!item || !stat || !pt || stat.adjustment) continue;
    stat.assigned += claim.quantity;
    const amount = claim.quantity * stat.unitPrice;
    pt.lines.push({ itemId: item.id, quantity: claim.quantity, amount });
    pt.subtotal += amount;
  }

  let receiptSum = 0;
  let positiveSum = 0;
  let adjustmentSum = 0;
  let openSum = 0;
  const overAssignedItemIds: string[] = [];
  for (const item of items) {
    const stat = stats[item.id];
    receiptSum += item.total_price;
    if (stat.adjustment) {
      adjustmentSum += item.total_price;
      stat.remaining = 0;
      continue;
    }
    positiveSum += item.total_price;
    stat.remaining = Math.max(0, item.quantity - stat.assigned);
    if (stat.remaining < EPSILON) stat.remaining = 0;
    stat.over = stat.assigned > item.quantity + EPSILON;
    if (stat.over) overAssignedItemIds.push(item.id);
    stat.openAmount = stat.remaining * stat.unitPrice;
    openSum += stat.openAmount;
  }

  // Rabatte anteilig nach Zwischensumme verteilen
  const list = Object.values(totals);
  const subtotalSum = list.reduce((s, t) => s + t.subtotal, 0);
  const rawSub = list.map((t) => t.subtotal);
  const rawAdj = list.map((t) => (subtotalSum > EPSILON ? (adjustmentSum * t.subtotal) / subtotalSum : 0));
  const rawTip = list.map((_, i) => (rawSub[i] + rawAdj[i]) * tipFactor);
  // Centgenau runden, sodass die Summe der Anteile exakt zur gerundeten Gesamtsumme passt
  const sub = distributeCents(rawSub);
  const adj = distributeCents(rawAdj);
  const tips = distributeCents(rawTip);
  let assignedSum = 0;
  let tipSum = 0;
  let grandTotal = 0;
  list.forEach((t, i) => {
    t.subtotal = sub[i];
    t.adjustments = adj[i];
    t.tip = tips[i];
    t.total = round2(t.subtotal + t.adjustments + t.tip);
    t.lines = t.lines.map((l) => ({ ...l, amount: round2(l.amount) }));
    assignedSum += t.subtotal;
    tipSum += t.tip;
    grandTotal += t.total;
  });
  if (subtotalSum <= EPSILON) openSum += adjustmentSum;

  return {
    items: stats,
    participants: totals,
    receiptSum: round2(receiptSum),
    assignedSum: round2(assignedSum),
    openSum: round2(Math.max(0, openSum)),
    tipSum: round2(tipSum),
    grandTotal: round2(grandTotal),
    overAssignedItemIds,
    progress: positiveSum > EPSILON ? Math.min(1, Math.max(0, 1 - openSum / positiveSum)) : 0,
  };
}

/**
 * Verteilt die noch offenen Mengen gleichmäßig auf die angegebenen Personen.
 * Liefert die neuen Gesamtmengen pro (Position, Person) – bestehende Anteile werden erhöht.
 */
export function splitRemaining(input: {
  items: ItemRow[];
  claims: ClaimRow[];
  participantIds: string[];
}): { item_id: string; participant_id: string; quantity: number }[] {
  const { items, claims, participantIds } = input;
  if (participantIds.length === 0) return [];
  const result: { item_id: string; participant_id: string; quantity: number }[] = [];
  for (const item of items) {
    if (isAdjustment(item)) continue;
    const itemClaims = claims.filter((c) => c.item_id === item.id);
    const assigned = itemClaims.reduce((s, c) => s + c.quantity, 0);
    const remaining = item.quantity - assigned;
    if (remaining <= EPSILON) continue;
    const share = remaining / participantIds.length;
    for (const pid of participantIds) {
      const existing = itemClaims.find((c) => c.participant_id === pid);
      result.push({
        item_id: item.id,
        participant_id: pid,
        quantity: roundQty((existing?.quantity ?? 0) + share),
      });
    }
  }
  return result;
}

/**
 * Rundet Beträge auf Cent, sodass die Summe der gerundeten Werte der gerundeten Summe entspricht
 * (Verfahren der größten Reste). Verhindert z. B. 3 × 33,33 € = 99,99 € statt 100,00 €.
 */
export function distributeCents(values: number[]): number[] {
  const cents = values.map((v) => v * 100);
  const target = Math.round(cents.reduce((s, c) => s + c, 0) + Number.EPSILON);
  const floored = cents.map((c) => Math.floor(c + 1e-7));
  let diff = target - floored.reduce((s, c) => s + c, 0);
  const order = cents
    .map((c, i) => ({ i, rest: c - Math.floor(c + 1e-7) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  const result = [...floored];
  for (let k = 0; diff > 0 && order.length > 0; k = (k + 1) % order.length, diff--) result[order[k].i] += 1;
  for (let k = 0; diff < 0 && order.length > 0; k = (k + 1) % order.length, diff++) result[order[order.length - 1 - k].i] -= 1;
  return result.map((c) => c / 100);
}

export function roundQty(n: number): number {
  return Math.round(n * 10000) / 10000;
}

const FRACTIONS: [number, string][] = [
  [1 / 2, "½"],
  [1 / 3, "⅓"],
  [2 / 3, "⅔"],
  [1 / 4, "¼"],
  [3 / 4, "¾"],
  [1 / 5, "⅕"],
  [1 / 6, "⅙"],
  [1 / 8, "⅛"],
];

/** 2 → "2", 0.5 → "½", 1.5 → "1½", 0.4 → "0,4" */
export function formatQty(q: number): string {
  const whole = Math.floor(q + EPSILON);
  const frac = q - whole;
  if (frac < 0.001) return String(whole);
  for (const [value, sym] of FRACTIONS) {
    if (Math.abs(frac - value) < 0.002) return whole > 0 ? `${whole}${sym}` : sym;
  }
  return q.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function formatMoney(n: number, currency = "EUR"): string {
  if (currency === "EUR") return euro.format(n);
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(n);
}
