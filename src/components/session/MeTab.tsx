"use client";

import { useState } from "react";
import { formatMoney, formatQty } from "@/lib/calc";
import { Button, Card, Stepper, cx } from "../ui";
import { useSession } from "./context";
import type { Tab } from "./SessionApp";

export function MeTab({ goTo }: { goTo: (t: Tab) => void }) {
  const { state, settlement, call } = useSession();
  const { me, session, items } = state;
  const mine = settlement.participants[me.id];
  const itemById = new Map(items.map((i) => [i.id, i]));
  const myNotes = state.notes.filter((n) => n.participant_id === me.id);
  const openQuestions = state.messages.filter(
    (m) => m.kind === "question" && m.question_status === "open" && m.recipient_id === me.id,
  );
  const openItems = items.filter((i) => (settlement.items[i.id]?.remaining ?? 0) > 0);
  const [busy, setBusy] = useState<string | null>(null);
  const closed = session.status === "closed";
  const tip = session.tip_percent;

  async function setQty(itemId: string, quantity: number) {
    setBusy(itemId);
    await call("/claims", { method: "PUT", body: { itemId, quantity } });
    setBusy(null);
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-4">
      <div className="flex flex-col gap-3">
        {openQuestions.length > 0 && (
          <button
            onClick={() => goTo("chat")}
            className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-left ring-2 ring-amber-300"
          >
            <span className="text-2xl">❓</span>
            <span className="flex-1 text-sm">
              <b>Die KI hat {openQuestions.length === 1 ? "eine Rückfrage" : `${openQuestions.length} Rückfragen`} an dich.</b>
              <br />
              <span className="text-zinc-600">Zum Chat und kurz antworten →</span>
            </span>
          </button>
        )}

        <Card className="bg-gradient-to-br from-brand-600 to-brand-700 text-white ring-0">
          <div className="text-sm text-white/80">{items.length ? "Du zahlst" : "Dein Betrag"}</div>
          <div className="text-4xl font-bold tabular-nums" data-testid="my-total">
            {items.length ? formatMoney(mine?.total ?? 0) : "–"}
          </div>
          {items.length > 0 ? (
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-sm text-white/90">
              <span>Deine Positionen</span>
              <span className="text-right tabular-nums">{formatMoney(mine?.subtotal ?? 0)}</span>
              {mine && mine.adjustments !== 0 && (
                <>
                  <span>Anteil Rabatt</span>
                  <span className="text-right tabular-nums">{formatMoney(mine.adjustments)}</span>
                </>
              )}
              <span>Trinkgeld ({tip.toLocaleString("de-DE")} %)</span>
              <span className="text-right tabular-nums">{formatMoney(mine?.tip ?? 0)}</span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-white/85">
              Sobald der Kassenzettel fotografiert ist, siehst du hier, was du zahlen musst.
            </p>
          )}
          {items.length > 0 && (
            <div className="mt-4 flex gap-2">
              {me.confirmed_at ? (
                <Button
                  variant="secondary"
                  className="flex-1 bg-white/15 text-white ring-white/30 hover:bg-white/25"
                  onClick={() => call("/confirm", { body: { confirmed: false } })}
                  disabled={closed}
                >
                  ✓ Bestätigt
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => call("/confirm", { body: { confirmed: true } })}
                  disabled={closed || !mine?.lines.length}
                >
                  Passt so – bestätigen
                </Button>
              )}
              <Button
                variant="secondary"
                className={cx("flex-1", me.paid_at ? "bg-emerald-500 text-white ring-emerald-400 hover:bg-emerald-600" : "bg-white/15 text-white ring-white/30 hover:bg-white/25")}
                onClick={() => call("/paid", { body: { paid: !me.paid_at } })}
                disabled={me.is_host}
                title={me.is_host ? "Du bist der Host" : undefined}
              >
                {me.is_host ? "Du bist Host" : me.paid_at ? "✓ Bezahlt" : "Ich hab bezahlt"}
              </Button>
            </div>
          )}
        </Card>

        {items.length > 0 && (
          <Card>
            <h2 className="mb-2 font-semibold">Deine Positionen</h2>
            {mine && mine.lines.length > 0 ? (
              <ul className="divide-y divide-zinc-100">
                {mine.lines.map((line) => {
                  const item = itemById.get(line.itemId);
                  if (!item) return null;
                  const stat = settlement.items[item.id];
                  return (
                    <li key={line.itemId} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.name_de || item.name_original}</div>
                        <div className="text-xs text-zinc-500 tabular-nums">
                          {formatQty(line.quantity)} von {formatQty(item.quantity)} · {formatMoney(line.amount)}
                        </div>
                      </div>
                      {closed ? (
                        <span className="font-semibold tabular-nums">{formatQty(line.quantity)}×</span>
                      ) : (
                        <Stepper
                          value={line.quantity}
                          step={item.quantity >= 2 ? 1 : 0.5}
                          max={line.quantity + (stat?.remaining ?? 0)}
                          onChange={(v) => void setQty(item.id, v)}
                          label={`Menge ${item.name_de}`}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-zinc-600">
                Noch nichts zugeordnet. Schreib im Chat, was du hattest, oder tippe unten auf offene Positionen.
              </p>
            )}
            {busy && <p className="mt-1 text-xs text-zinc-400">Speichere…</p>}
          </Card>
        )}

        {items.length > 0 && openItems.length > 0 && !closed && (
          <Card>
            <h2 className="font-semibold">Noch offen auf dem Bon</h2>
            <p className="mb-2 text-xs text-zinc-500">Hattest du davon was? Antippen übernimmt eins für dich.</p>
            <ul className="flex flex-col gap-1.5">
              {openItems.map((item) => {
                const stat = settlement.items[item.id];
                const current = state.claims.find((c) => c.item_id === item.id && c.participant_id === me.id)?.quantity ?? 0;
                const add = Math.min(stat.remaining, item.quantity >= 2 ? 1 : stat.remaining);
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => void setQty(item.id, current + add)}
                      disabled={busy !== null}
                      className="flex w-full items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-left hover:bg-brand-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{item.name_de || item.name_original}</span>
                        <span className="text-xs text-zinc-500">
                          {formatQty(stat.remaining)} offen · je {formatMoney(stat.unitPrice)}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-brand-700">+ {formatQty(add)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Card>
          <h2 className="mb-1 font-semibold">Deine Notizen</h2>
          <p className="mb-2 text-xs text-zinc-500">Das hat die KI aus deinen Nachrichten und Fotos verstanden.</p>
          {myNotes.length ? (
            <ul className="flex flex-col gap-1">
              {myNotes.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {n.source === "photo" ? "📷" : "📝"} {formatQty(n.quantity)}× {n.description}
                    {n.variant ? ` (${n.variant})` : ""}
                    {n.shared_with.length ? <span className="text-zinc-500"> · geteilt mit {n.shared_with.join(", ")}</span> : null}
                  </span>
                  {!closed && (
                    <button
                      className="rounded-full px-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      onClick={() => call(`/notes/${n.id}`, { method: "DELETE" })}
                      aria-label="Notiz löschen"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-zinc-600">
              Noch nichts notiert.{" "}
              <button className="font-medium text-brand-700" onClick={() => goTo("chat")}>
                Im Chat eintragen →
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
