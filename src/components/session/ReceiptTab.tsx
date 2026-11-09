"use client";

import { useRef, useState } from "react";
import { formatMoney, formatQty, round2, unitPrice } from "@/lib/calc";
import { imagesToForm } from "@/lib/client/image";
import type { ItemRow } from "@/lib/types";
import { Avatar, Badge, Button, Card, Sheet, Spinner, Stepper, TextInput, cx } from "../ui";
import { useSession } from "./context";

export function ReceiptTab() {
  const { state, isHost, settlement, call } = useSession();
  const { session, items } = state;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const closed = session.status === "closed";

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const form = await imagesToForm([...files].slice(0, 4));
    await call("/receipt", { form });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      multiple
      className="hidden"
      onChange={(e) => void upload(e.target.files)}
      data-testid="receipt-input"
    />
  );

  if (session.receipt_status === "processing" || uploading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="relative">
          <div className="text-6xl">🧾</div>
          <Spinner className="absolute -right-3 -top-2 size-7 text-brand-600" />
        </div>
        <h2 className="text-lg font-semibold">{uploading ? "Lade Foto hoch…" : "Die KI liest den Kassenzettel…"}</h2>
        <p className="text-sm text-zinc-600">
          Sie übersetzt jede Position ins Deutsche und prüft die Summe. Das dauert meist 20–60 Sekunden.
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col overflow-y-auto px-4 py-6">
        {fileInput}
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <div className="text-5xl">📸</div>
          <h2 className="text-lg font-semibold">Kassenzettel fotografieren</h2>
          <p className="text-sm text-zinc-600">
            Sobald die Rechnung da ist: Foto machen (bei langen Bons gern mehrere). Die KI erkennt alle Positionen – auch auf
            Griechisch oder handschriftlich – und ordnet sie euren Chat-Einträgen zu.
          </p>
          {session.receipt_status === "error" && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{session.receipt_error}</p>
          )}
          {!closed && (
            <Button size="lg" className="mt-2 w-full" onClick={() => fileRef.current?.click()}>
              Foto aufnehmen
            </Button>
          )}
          {isHost && !closed && (
            <Button variant="ghost" onClick={() => setAdding(true)}>
              Positionen von Hand eingeben
            </Button>
          )}
        </Card>
        <AddItemSheet open={adding} onClose={() => setAdding(false)} />
      </div>
    );
  }

  const itemSum = round2(items.reduce((s, i) => s + i.total_price, 0));
  const mismatch = session.receipt_total !== null && Math.abs(session.receipt_total - itemSum) > 0.01;

  return (
    <div className="h-full overflow-y-auto px-3 py-4">
      {fileInput}
      <Card className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-zinc-500">{session.restaurant_name ?? "Rechnung"}</div>
            <div className="text-2xl font-bold tabular-nums">{formatMoney(itemSum)}</div>
            <div className="text-xs text-zinc-500">
              {items.length} Positionen · {Math.round(settlement.progress * 100)} % zugeordnet
            </div>
          </div>
          {Object.keys(state.receiptUrls).length > 0 && (
            <div className="flex -space-x-3">
              {Object.values(state.receiptUrls).map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer" className="block size-12 overflow-hidden rounded-lg ring-2 ring-white">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signierte Supabase-URL */}
                  <img src={u} alt={`Bon ${i + 1}`} className="size-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${settlement.progress * 100}%` }} />
        </div>
        {mismatch && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ⚠️ Positionen ergeben {formatMoney(itemSum)}, auf dem Bon steht {formatMoney(session.receipt_total!)}.
            {isHost ? " Tippe auf eine Position, um sie zu korrigieren." : " Der Host prüft das."}
          </p>
        )}
        {isHost && !closed && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => call("/match", { method: "POST" })}
              loading={session.match_status === "running"}
            >
              ✦ {session.matched_at ? "Neu zuordnen" : "KI zuordnen"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              + Position
            </Button>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              Neues Foto
            </Button>
          </div>
        )}
        {session.match_status === "running" && (
          <p className="mt-2 flex items-center gap-2 text-sm text-brand-700">
            <Spinner className="size-4" /> Die KI ordnet zu und stellt Rückfragen…
          </p>
        )}
        {session.match_status === "error" && <p className="mt-2 text-sm text-red-600">{session.match_error}</p>}
      </Card>

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <ItemRowView key={item.id} item={item} onClick={() => setOpenItem(item.id)} />
        ))}
      </ul>

      <ItemSheet itemId={openItem} onClose={() => setOpenItem(null)} />
      <AddItemSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function ItemRowView({ item, onClick }: { item: ItemRow; onClick: () => void }) {
  const { state, settlement, byId } = useSession();
  const stat = settlement.items[item.id];
  const claims = state.claims.filter((c) => c.item_id === item.id);
  const mine = claims.find((c) => c.participant_id === state.me.id);
  return (
    <li>
      <button
        onClick={onClick}
        className={cx(
          "w-full rounded-2xl bg-white px-3.5 py-3 text-left shadow-sm ring-1 transition active:scale-[0.99]",
          stat?.over ? "ring-red-300" : mine ? "ring-brand-200" : "ring-zinc-100",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium leading-snug">
              {item.quantity !== 1 && <span className="text-zinc-500">{formatQty(item.quantity)}× </span>}
              {item.name_de || item.name_original}
            </div>
            {item.name_de && item.name_de !== item.name_original && (
              <div className="truncate text-xs text-zinc-500">{item.name_original}</div>
            )}
          </div>
          <div className="text-right">
            <div className="font-semibold tabular-nums">{formatMoney(item.total_price)}</div>
            {item.quantity !== 1 && <div className="text-xs text-zinc-500 tabular-nums">à {formatMoney(unitPrice(item))}</div>}
          </div>
        </div>
        {!stat?.adjustment && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {claims.map((c) => {
              const p = byId.get(c.participant_id);
              if (!p) return null;
              return (
                <span
                  key={c.id}
                  className={cx(
                    "inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-xs",
                    c.participant_id === state.me.id ? "bg-brand-50 text-brand-800" : "bg-zinc-100 text-zinc-700",
                  )}
                >
                  <Avatar name={p.name} size="sm" />
                  {p.name}
                  {(item.quantity !== 1 || c.quantity !== 1) && <b className="tabular-nums">{formatQty(c.quantity)}×</b>}
                  {c.source === "ai" && <span title="von der KI zugeordnet">✦</span>}
                </span>
              );
            })}
            {stat && stat.remaining > 0 && (
              <Badge className="bg-amber-100 text-amber-800">{formatQty(stat.remaining)} offen</Badge>
            )}
            {stat?.over && <Badge className="bg-red-100 text-red-700">überbucht</Badge>}
          </div>
        )}
        {stat?.adjustment && <div className="mt-1 text-xs text-zinc-500">Rabatt – wird anteilig auf alle verteilt</div>}
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Detail einer Position: übernehmen, teilen, (Host) bearbeiten
// ---------------------------------------------------------------------------

function ItemSheet({ itemId, onClose }: { itemId: string | null; onClose: () => void }) {
  const { state, isHost, settlement, call } = useSession();
  const item = state.items.find((i) => i.id === itemId);
  const [mode, setMode] = useState<"view" | "share" | "edit">("view");
  const [shareWith, setShareWith] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState({ nameDe: "", nameOriginal: "", quantity: "", totalPrice: "" });

  if (!item) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const stat = settlement.items[item.id];
  const claims = state.claims.filter((c) => c.item_id === item.id);
  const closed = state.session.status === "closed";
  const qtyOf = (pid: string) => claims.find((c) => c.participant_id === pid)?.quantity ?? 0;
  const step = item.quantity >= 2 ? 1 : 0.5;

  const close = () => {
    setMode("view");
    onClose();
  };

  async function setQty(pid: string, quantity: number) {
    await call("/claims", { method: "PUT", body: { itemId: item!.id, quantity, participantId: pid } });
  }

  const people = isHost ? state.participants : state.participants.filter((p) => p.id === state.me.id);

  return (
    <Sheet open onClose={close} title={item.name_de || item.name_original}>
      {mode === "view" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 text-sm">
            <span className="text-zinc-500">{item.name_original}</span>
            <span className="font-medium tabular-nums">
              {formatQty(item.quantity)} × {formatMoney(unitPrice(item))} = {formatMoney(item.total_price)}
            </span>
          </div>

          {stat?.adjustment ? (
            <p className="text-sm text-zinc-600">Das ist ein Rabatt bzw. eine Gutschrift und wird anteilig auf alle verteilt.</p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{isHost ? "Wer hatte das?" : "Wie viel davon hattest du?"}</span>
                  {stat && (
                    <span className={cx("text-xs", stat.over ? "text-red-600" : stat.remaining > 0 ? "text-amber-700" : "text-emerald-700")}>
                      {stat.over ? "überbucht" : stat.remaining > 0 ? `${formatQty(stat.remaining)} noch offen` : "komplett vergeben"}
                    </span>
                  )}
                </div>
                {people.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[15px]">
                      <Avatar name={p.name} size="sm" />
                      {p.id === state.me.id ? "Ich" : p.name}
                    </span>
                    <Stepper
                      value={qtyOf(p.id)}
                      step={step}
                      max={qtyOf(p.id) + (stat?.remaining ?? 0)}
                      onChange={(v) => void setQty(p.id, v)}
                      label={`Menge für ${p.name}`}
                    />
                  </div>
                ))}
                {!isHost &&
                  claims
                    .filter((c) => c.participant_id !== state.me.id)
                    .map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-sm text-zinc-600">
                        <span className="flex items-center gap-2">
                          <Avatar name={state.participants.find((p) => p.id === c.participant_id)?.name ?? "?"} size="sm" />
                          {state.participants.find((p) => p.id === c.participant_id)?.name}
                        </span>
                        <span className="tabular-nums">{formatQty(c.quantity)}×</span>
                      </div>
                    ))}
              </div>
              {!closed && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShareWith([state.me.id]);
                    setMode("share");
                  }}
                >
                  Geteilt? Auf mehrere aufteilen
                </Button>
              )}
            </>
          )}

          {isHost && !closed && (
            <div className="flex gap-2 border-t border-zinc-100 pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEdit({
                    nameDe: item.name_de ?? "",
                    nameOriginal: item.name_original,
                    quantity: String(item.quantity).replace(".", ","),
                    totalPrice: String(item.total_price).replace(".", ","),
                  });
                  setMode("edit");
                }}
              >
                Bearbeiten
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50"
                onClick={async () => {
                  if (!confirm("Position wirklich löschen?")) return;
                  await call(`/items/${item.id}`, { method: "DELETE" });
                  close();
                }}
              >
                Löschen
              </Button>
            </div>
          )}
        </div>
      )}

      {mode === "share" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-600">
            Wer hat sich das geteilt? Die {stat && stat.remaining < item.quantity ? "freie Menge" : "Position"} wird gleichmäßig
            aufgeteilt.
          </p>
          <div className="flex flex-col gap-1.5">
            {state.participants.map((p) => {
              const on = shareWith.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => setShareWith((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                  className={cx(
                    "flex items-center justify-between rounded-xl px-3 py-2.5 ring-1",
                    on ? "bg-brand-50 ring-brand-300" : "bg-white ring-zinc-200",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Avatar name={p.name} size="sm" /> {p.id === state.me.id ? "Ich" : p.name}
                  </span>
                  <span className={cx("size-5 rounded-md ring-1", on ? "bg-brand-600 ring-brand-600" : "ring-zinc-300")}>
                    {on && <span className="block text-center text-xs leading-5 text-white">✓</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setMode("view")}>
              Zurück
            </Button>
            <Button
              className="flex-1"
              loading={busy}
              disabled={shareWith.length === 0}
              onClick={async () => {
                setBusy(true);
                const ok = await call("/share", { body: { itemId: item.id, participantIds: shareWith } });
                setBusy(false);
                if (ok) setMode("view");
              }}
            >
              Auf {shareWith.length} {shareWith.length === 1 ? "Person" : "Personen"} aufteilen
            </Button>
          </div>
        </div>
      )}

      {mode === "edit" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const ok = await call(`/items/${item.id}`, { method: "PATCH", body: edit });
            setBusy(false);
            if (ok) setMode("view");
          }}
        >
          <Field label="Deutsche Bezeichnung">
            <TextInput value={edit.nameDe} onChange={(e) => setEdit({ ...edit, nameDe: e.target.value })} required />
          </Field>
          <Field label="Original (wie auf dem Bon)">
            <TextInput value={edit.nameOriginal} onChange={(e) => setEdit({ ...edit, nameOriginal: e.target.value })} required />
          </Field>
          <div className="flex gap-2">
            <Field label="Menge">
              <TextInput inputMode="decimal" value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: e.target.value })} required />
            </Field>
            <Field label="Gesamtpreis €">
              <TextInput inputMode="decimal" value={edit.totalPrice} onChange={(e) => setEdit({ ...edit, totalPrice: e.target.value })} required />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode("view")}>
              Abbrechen
            </Button>
            <Button type="submit" className="flex-1" loading={busy}>
              Speichern
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      {children}
    </label>
  );
}

function AddItemSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { call } = useSession();
  const [form, setForm] = useState({ name: "", quantity: "1", totalPrice: "" });
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Position hinzufügen">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await call("/items", { body: form });
          setBusy(false);
          if (ok) {
            setForm({ name: "", quantity: "1", totalPrice: "" });
            onClose();
          }
        }}
      >
        <Field label="Bezeichnung">
          <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Mythos 0,5 l" required autoFocus />
        </Field>
        <div className="flex gap-2">
          <Field label="Menge">
            <TextInput inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </Field>
          <Field label="Gesamtpreis €">
            <TextInput inputMode="decimal" value={form.totalPrice} onChange={(e) => setForm({ ...form, totalPrice: e.target.value })} placeholder="0,00" required />
          </Field>
        </div>
        <Button type="submit" loading={busy}>
          Hinzufügen
        </Button>
      </form>
    </Sheet>
  );
}
