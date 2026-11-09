"use client";

import { useState } from "react";
import { formatMoney, formatQty } from "@/lib/calc";
import { Avatar, Badge, Button, Card, Sheet, TextInput, cx, useToast } from "../ui";
import { useSession } from "./context";

export function OverviewTab() {
  const { state, settlement, isHost, call, byId } = useSession();
  const toast = useToast();
  const { session, participants, items, claims } = state;
  const [splitOpen, setSplitOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const closed = session.status === "closed";
  const host = participants.find((p) => p.is_host);

  const openQuestionsFor = (pid: string) =>
    state.messages.filter((m) => m.kind === "question" && m.question_status === "open" && m.recipient_id === pid).length;
  const hasActivity = (pid: string) =>
    state.notes.some((n) => n.participant_id === pid) || claims.some((c) => c.participant_id === pid);

  const openItems = items.filter((i) => (settlement.items[i.id]?.remaining ?? 0) > 0);
  const overItems = items.filter((i) => settlement.items[i.id]?.over);
  const othersTotal = participants
    .filter((p) => !p.is_host)
    .reduce((s, p) => s + (settlement.participants[p.id]?.total ?? 0), 0);
  const othersPaid = participants
    .filter((p) => !p.is_host && p.paid_at)
    .reduce((s, p) => s + (settlement.participants[p.id]?.total ?? 0), 0);

  function summaryText() {
    const lines = [
      `🧾 ${session.title}${session.restaurant_name ? ` (${session.restaurant_name})` : ""}`,
      `Rechnung ${formatMoney(settlement.receiptSum)} + ${session.tip_percent.toLocaleString("de-DE")} % Trinkgeld`,
      "",
      ...participants.map((p) => `${p.name}: ${formatMoney(settlement.participants[p.id]?.total ?? 0)}${p.paid_at ? " ✅" : ""}`),
    ];
    if (settlement.openSum > 0) lines.push("", `Noch nicht zugeordnet: ${formatMoney(settlement.openSum)}`);
    if (host) lines.push("", `Bitte an ${host.name} überweisen 🙏`);
    return lines.join("\n");
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-4">
      <div className="flex flex-col gap-3">
        {items.length === 0 ? (
          <Card>
            <h2 className="font-semibold">Noch kein Kassenzettel</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Bis die Rechnung kommt, sammelt die KI im Chat, wer was hatte. Danach siehst du hier, was offen ist und wer noch
              fehlt.
            </p>
          </Card>
        ) : (
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Rechnung" value={formatMoney(settlement.receiptSum)} />
              <Stat label="+ Trinkgeld" value={`${formatMoney(settlement.tipSum)} (${session.tip_percent.toLocaleString("de-DE")} %)`} />
              <Stat label="Zugeordnet" value={formatMoney(settlement.assignedSum)} tone="good" />
              <Stat label="Noch offen" value={formatMoney(settlement.openSum)} tone={settlement.openSum > 0 ? "warn" : "good"} testId="open-sum" />
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${settlement.progress * 100}%` }} />
            </div>
            {isHost && (
              <p className="mt-3 text-sm text-zinc-600">
                Du bekommst von den anderen <b className="text-zinc-900">{formatMoney(othersTotal)}</b>
                {othersPaid > 0 && <> · davon schon {formatMoney(othersPaid)} bezahlt</>}.
              </p>
            )}
          </Card>
        )}

        {isHost && (
          <Card>
            <h2 className="mb-3 font-semibold">Host-Aktionen</h2>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setTipOpen(true)} disabled={closed}>
                Trinkgeld: {session.tip_percent.toLocaleString("de-DE")} %
              </Button>
              <Button
                variant="secondary"
                onClick={() => call("/match", { method: "POST" })}
                disabled={closed || items.length === 0}
                loading={session.match_status === "running"}
              >
                ✦ KI zuordnen
              </Button>
              <Button variant="secondary" onClick={() => setSplitOpen(true)} disabled={closed || settlement.openSum <= 0}>
                Rest verteilen
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard?.writeText(summaryText());
                  toast("Zusammenfassung kopiert – ab in die Gruppe damit");
                }}
                disabled={items.length === 0}
              >
                Zusammenfassung
              </Button>
              {closed ? (
                <Button variant="secondary" className="col-span-2" onClick={() => call("", { method: "PATCH", body: { status: "assigning" } })}>
                  Runde wieder öffnen
                </Button>
              ) : (
                <Button
                  className="col-span-2"
                  disabled={items.length === 0}
                  onClick={() => {
                    if (settlement.openSum > 0 && !confirm(`Es sind noch ${formatMoney(settlement.openSum)} offen. Trotzdem abschließen?`)) return;
                    void call("", { method: "PATCH", body: { status: "closed" } });
                  }}
                >
                  Runde abschließen
                </Button>
              )}
            </div>
          </Card>
        )}

        <Card>
          <h2 className="mb-2 font-semibold">Personen</h2>
          <ul className="divide-y divide-zinc-100">
            {participants.map((p) => {
              const total = settlement.participants[p.id]?.total ?? 0;
              const questions = openQuestionsFor(p.id);
              const active = hasActivity(p.id);
              return (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={p.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      <span className="truncate">{p.name}</span>
                      {p.is_host && <Badge className="bg-brand-100 text-brand-700">Host</Badge>}
                      {p.id === state.me.id && <span className="text-xs text-zinc-400">(du)</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 pt-0.5 text-xs">
                      {!active && <span className="text-red-600">noch nichts eingetragen</span>}
                      {questions > 0 && <span className="text-amber-700">❓ {questions} offene Rückfrage{questions > 1 ? "n" : ""}</span>}
                      {active && !questions && !p.confirmed_at && items.length > 0 && <span className="text-zinc-500">nicht bestätigt</span>}
                      {p.confirmed_at && <span className="text-emerald-700">✓ bestätigt</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums" data-testid="person-total">
                      {items.length ? formatMoney(total) : "–"}
                    </span>
                    {!p.is_host && items.length > 0 && (
                      <button
                        disabled={!isHost && p.id !== state.me.id}
                        onClick={() => call("/paid", { body: { participantId: p.id, paid: !p.paid_at } })}
                        className={cx(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          p.paid_at ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500",
                          (isHost || p.id === state.me.id) && "hover:ring-1 hover:ring-zinc-300",
                        )}
                      >
                        {p.paid_at ? "✓ bezahlt" : "offen"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {overItems.length > 0 && (
          <Card className="ring-red-200">
            <h2 className="mb-2 font-semibold text-red-700">Überbucht</h2>
            <p className="mb-2 text-xs text-zinc-500">Hier wurde mehr übernommen, als auf dem Bon steht.</p>
            <ul className="flex flex-col gap-2">
              {overItems.map((i) => (
                <li key={i.id} className="text-sm">
                  <div className="font-medium">
                    {formatQty(i.quantity)}× {i.name_de || i.name_original}
                  </div>
                  <div className="text-xs text-zinc-600">
                    {claims
                      .filter((c) => c.item_id === i.id)
                      .map((c) => `${byId.get(c.participant_id)?.name}: ${formatQty(c.quantity)}`)
                      .join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {openItems.length > 0 && (
          <Card>
            <h2 className="mb-2 font-semibold">Noch offen</h2>
            <ul className="flex flex-col gap-1.5">
              {openItems.map((i) => {
                const stat = settlement.items[i.id];
                return (
                  <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      {formatQty(stat.remaining)}× {i.name_de || i.name_original}
                    </span>
                    <span className="font-medium tabular-nums text-amber-700">{formatMoney(stat.openAmount)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      <SplitSheet open={splitOpen} onClose={() => setSplitOpen(false)} />
      <TipSheet open={tipOpen} onClose={() => setTipOpen(false)} />
    </div>
  );
}

function Stat({ label, value, tone, testId }: { label: string; value: string; tone?: "good" | "warn"; testId?: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div
        data-testid={testId}
        className={cx("font-semibold tabular-nums", tone === "warn" && "text-amber-700", tone === "good" && "text-emerald-700")}
      >
        {value}
      </div>
    </div>
  );
}

function SplitSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, settlement, call } = useSession();
  const [selected, setSelected] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = selected ?? state.participants.map((p) => p.id);
  const per = chosen.length ? settlement.openSum / chosen.length : 0;
  return (
    <Sheet
      open={open}
      onClose={() => {
        setSelected(null);
        onClose();
      }}
      title="Rest gleichmäßig verteilen"
    >
      <p className="mb-3 text-sm text-zinc-600">
        Alles, was noch offen ist ({formatMoney(settlement.openSum)}), wird zu gleichen Teilen auf diese Personen verteilt – etwa{" "}
        {formatMoney(per)} pro Person plus Trinkgeld.
      </p>
      <div className="mb-4 flex flex-col gap-1.5">
        {state.participants.map((p) => {
          const on = chosen.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => setSelected(on ? chosen.filter((x) => x !== p.id) : [...chosen, p.id])}
              className={cx("flex items-center justify-between rounded-xl px-3 py-2.5 ring-1", on ? "bg-brand-50 ring-brand-300" : "bg-white ring-zinc-200")}
            >
              <span className="flex items-center gap-2">
                <Avatar name={p.name} size="sm" /> {p.name}
              </span>
              <span>{on ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
      <Button
        className="w-full"
        loading={busy}
        disabled={chosen.length === 0}
        onClick={async () => {
          setBusy(true);
          const ok = await call("/split", { body: { participantIds: chosen } });
          setBusy(false);
          if (ok) {
            setSelected(null);
            onClose();
          }
        }}
      >
        Auf {chosen.length} {chosen.length === 1 ? "Person" : "Personen"} verteilen
      </Button>
    </Sheet>
  );
}

function TipSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, call } = useSession();
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = value ?? String(state.session.tip_percent).replace(".", ",");
  return (
    <Sheet open={open} onClose={onClose} title="Trinkgeld für alle">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {["0", "5", "10", "15"].map((t) => (
            <button
              key={t}
              onClick={() => setValue(t)}
              className={cx("flex-1 rounded-xl py-2.5 text-sm font-medium ring-1", current === t ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-zinc-200")}
            >
              {t} %
            </button>
          ))}
        </div>
        <TextInput inputMode="decimal" value={current} onChange={(e) => setValue(e.target.value)} aria-label="Trinkgeld in Prozent" />
        <p className="text-xs text-zinc-500">Jeder zahlt diesen Prozentsatz auf seinen eigenen Anteil.</p>
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await call("", { method: "PATCH", body: { tipPercent: current } });
            setBusy(false);
            if (ok) {
              setValue(null);
              onClose();
            }
          }}
        >
          Speichern
        </Button>
      </div>
    </Sheet>
  );
}
