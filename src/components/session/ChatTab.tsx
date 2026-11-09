"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatQty } from "@/lib/calc";
import { imagesToForm } from "@/lib/client/image";
import type { DetectedDish, MessageRow, NoteRow } from "@/lib/types";
import { AiAvatar, Avatar, Button, Spinner, cx } from "../ui";
import { useSession } from "./context";

export function ChatTab() {
  const { state, call } = useSession();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const closed = state.session.status === "closed";

  const notesByMessage = useMemo(() => {
    const map = new Map<string, NoteRow[]>();
    for (const n of state.notes) {
      if (!n.message_id) continue;
      map.set(n.message_id, [...(map.get(n.message_id) ?? []), n]);
    }
    return map;
  }, [state.notes]);

  const lastId = state.messages.at(-1)?.id;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const aiThinking = state.messages.some((m) => m.ai_status === "pending");

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const res = await call("/messages", { body: { body } });
    setSending(false);
    if (res) setText("");
  }

  async function sendPhoto(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const form = await imagesToForm([files[0]]);
    await call("/photos", { form });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-2.5">
          {state.messages.map((m) => (
            <MessageView key={m.id} message={m} notes={notesByMessage.get(m.id) ?? []} />
          ))}
          {aiThinking && (
            <div className="flex items-center gap-2 pl-1 text-sm text-zinc-500">
              <AiAvatar size="sm" />
              <span className="inline-flex gap-1">
                <Dot delay="0ms" />
                <Dot delay="150ms" />
                <Dot delay="300ms" />
              </span>
            </div>
          )}
        </div>
      </div>

      {!closed ? (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-zinc-200/70 bg-white px-3 py-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void sendPhoto(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
            aria-label="Foto vom Teller"
            title="Foto vom Teller"
          >
            {uploading ? (
              <Spinner />
            ) : (
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path
                  d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="13.5" r="3.5" />
              </svg>
            )}
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={1000}
            placeholder={state.items.length ? "Was hattest du? Oder antworte der KI…" : "Was hattest du? z. B. „2 Mythos, Gyros“"}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl bg-zinc-100 px-4 py-2.5 outline-none placeholder:text-zinc-400 focus:bg-white focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white disabled:opacity-40"
            aria-label="Senden"
          >
            {sending ? (
              <Spinner className="size-5" />
            ) : (
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
                <path d="M3.4 20.4l17.5-7.5a1 1 0 0 0 0-1.8L3.4 3.6a.9.9 0 0 0-1.2 1.1L4.6 12l-2.4 7.3a.9.9 0 0 0 1.2 1.1z" />
              </svg>
            )}
          </button>
        </form>
      ) : (
        <div className="border-t border-zinc-200/70 bg-white px-4 py-3 text-center text-sm text-zinc-500">
          Die Runde ist abgeschlossen.
        </div>
      )}
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return <span className="size-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: delay }} />;
}

// ---------------------------------------------------------------------------
// Einzelne Nachricht
// ---------------------------------------------------------------------------

function MessageView({ message: m, notes }: { message: MessageRow; notes: NoteRow[] }) {
  const { state, byId } = useSession();
  const author = m.participant_id ? byId.get(m.participant_id) : null;
  const mine = m.participant_id === state.me.id;
  const recipient = m.recipient_id ? byId.get(m.recipient_id) : null;
  const time = new Date(m.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  if (m.kind === "system") {
    return <div className="mx-auto max-w-[85%] px-2 py-1 text-center text-xs text-zinc-500">{m.body}</div>;
  }

  if (m.kind === "question") return <QuestionCard message={m} />;

  if (m.kind === "ai") {
    const forMe = m.recipient_id === state.me.id;
    return (
      <div className="flex items-end gap-2">
        <AiAvatar />
        <div className={cx("max-w-[80%] rounded-2xl rounded-bl-md px-3.5 py-2 text-[15px]", forMe ? "bg-brand-50 ring-1 ring-brand-100" : "bg-white ring-1 ring-zinc-100")}>
          {recipient && <div className="mb-0.5 text-xs font-medium text-brand-700">an {recipient.id === state.me.id ? "dich" : recipient.name}</div>}
          <p className="whitespace-pre-wrap">{m.body}</p>
          <div className="mt-0.5 text-right text-[10px] text-zinc-400">{time}</div>
        </div>
      </div>
    );
  }

  // Nachricht einer Person
  return (
    <div className={cx("flex items-end gap-2", mine && "flex-row-reverse")}>
      {!mine && author && <Avatar name={author.name} />}
      <div className={cx("flex max-w-[80%] flex-col gap-1", mine ? "items-end" : "items-start")}>
        {m.image_path ? (
          <PhotoMessage message={m} mine={mine} />
        ) : (
          <div
            className={cx(
              "rounded-2xl px-3.5 py-2 text-[15px]",
              mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-white ring-1 ring-zinc-100",
            )}
          >
            {!mine && author && <div className="mb-0.5 text-xs font-semibold text-zinc-500">{author.name}</div>}
            <p className="whitespace-pre-wrap">{m.body}</p>
            <div className={cx("mt-0.5 text-right text-[10px]", mine ? "text-white/70" : "text-zinc-400")}>
              {time}
              {m.ai_status === "error" && " · KI-Fehler"}
            </div>
          </div>
        )}
        {notes.length > 0 && (
          <div className={cx("flex flex-wrap gap-1", mine && "justify-end")}>
            {notes.map((n) => (
              <NoteChip key={n.id} note={n} canDelete={mine && state.session.status !== "closed"} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NoteChip({ note, canDelete }: { note: NoteRow; canDelete: boolean }) {
  const { call } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white py-0.5 pl-2 pr-1 text-xs text-zinc-700 ring-1 ring-zinc-200">
      📝 {formatQty(note.quantity)}× {note.description}
      {note.variant ? ` (${note.variant})` : ""}
      {note.shared_with.length > 0 ? ` · geteilt mit ${note.shared_with.join(", ")}` : ""}
      {canDelete && (
        <button
          onClick={async () => {
            setBusy(true);
            await call(`/notes/${note.id}`, { method: "DELETE" });
            setBusy(false);
          }}
          disabled={busy}
          className="ml-0.5 rounded-full px-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Notiz löschen"
        >
          ×
        </button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Rückfrage der KI mit Antwort-Buttons
// ---------------------------------------------------------------------------

function QuestionCard({ message: m }: { message: MessageRow }) {
  const { state, byId, call, isHost } = useSession();
  const [busy, setBusy] = useState<number | null>(null);
  const recipient = m.recipient_id ? byId.get(m.recipient_id) : null;
  const forMe = m.recipient_id === state.me.id;
  const open = m.question_status === "open";
  const canAnswer = open && (forMe || isHost) && state.session.status !== "closed";

  return (
    <div className="flex items-end gap-2">
      <AiAvatar />
      <div
        className={cx(
          "max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[15px]",
          open && forMe ? "bg-amber-50 ring-2 ring-amber-300" : "bg-white ring-1 ring-zinc-100",
          !open && "opacity-70",
        )}
      >
        <div className="mb-1 text-xs font-medium text-amber-700">
          Rückfrage an {forMe ? "dich" : recipient?.name ?? "?"}
          {m.question_status === "dismissed" && " · erledigt"}
        </div>
        <p className="whitespace-pre-wrap">{m.body}</p>
        {m.meta.options && (
          <div className="mt-2 flex flex-col gap-1.5">
            {m.meta.options.map((o, i) => {
              const chosen = m.meta.answer_label === o.label;
              return (
                <button
                  key={i}
                  disabled={!canAnswer || busy !== null}
                  onClick={async () => {
                    setBusy(i);
                    await call(`/questions/${m.id}`, { body: { optionIndex: i } });
                    setBusy(null);
                  }}
                  className={cx(
                    "flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition",
                    chosen
                      ? "bg-emerald-600 text-white"
                      : canAnswer
                        ? "bg-white text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50 active:scale-[0.99]"
                        : "bg-zinc-50 text-zinc-500",
                  )}
                >
                  {o.label}
                  {busy === i && <Spinner className="size-4" />}
                  {chosen && <span>✓</span>}
                </button>
              );
            })}
          </div>
        )}
        {canAnswer && <p className="mt-2 text-xs text-zinc-500">Oder antworte einfach im Chat.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tellerfoto mit markierten Speisen
// ---------------------------------------------------------------------------

function PhotoMessage({ message: m, mine }: { message: MessageRow; mine: boolean }) {
  const { state, call } = useSession();
  const url = state.photoUrls[m.id];
  const dishes = m.meta.dishes ?? [];
  const status = m.meta.photo_status;
  const reviewing = mine && status === "review" && state.session.status !== "closed";
  const [selected, setSelected] = useState<boolean[]>(() => dishes.map((d) => d.selected));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Auswahl folgt neuen KI-Ergebnissen
    setSelected(dishes.map((d) => d.selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dishes.length, status]);

  const shown: DetectedDish[] = dishes.map((d, i) => ({ ...d, selected: reviewing ? !!selected[i] : d.selected }));
  const toggle = (i: number) => reviewing && setSelected((s) => s.map((v, j) => (j === i ? !v : v)));

  return (
    <div className="w-72 max-w-full overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200">
      <div className="relative">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- signierte Supabase-URL
          <img src={url} alt="Tellerfoto" className="block w-full" />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center bg-zinc-100 text-zinc-400">Foto</div>
        )}
        {status === "analyzing" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
            <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm">
              <Spinner className="size-4" /> KI schaut drauf…
            </div>
          </div>
        )}
        {shown.map((d, i) =>
          d.box ? (
            <button
              key={i}
              onClick={() => toggle(i)}
              disabled={!reviewing}
              className={cx(
                "absolute rounded-xl border-2 transition",
                d.selected
                  ? "border-white bg-white/10 shadow-[0_0_0_2px_rgba(47,111,223,0.9),0_0_24px_rgba(47,111,223,0.6)]"
                  : "border-dashed border-white/60 bg-black/45",
              )}
              style={{
                left: `${d.box.x * 100}%`,
                top: `${d.box.y * 100}%`,
                width: `${d.box.w * 100}%`,
                height: `${d.box.h * 100}%`,
              }}
              aria-label={`${d.label} ${d.selected ? "abwählen" : "auswählen"}`}
            >
              <span
                className={cx(
                  "absolute left-1 top-1 max-w-[95%] truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                  d.selected ? "bg-brand-600 text-white" : "bg-black/70 text-white/80 line-through",
                )}
              >
                {d.quantity > 1 ? `${formatQty(d.quantity)}× ` : ""}
                {d.label}
              </span>
            </button>
          ) : null,
        )}
      </div>
      {dishes.length > 0 && (
        <div className="flex flex-col gap-1.5 p-2.5">
          <div className="flex flex-wrap gap-1">
            {shown.map((d, i) => (
              <button
                key={i}
                onClick={() => toggle(i)}
                disabled={!reviewing}
                className={cx(
                  "rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                  d.selected ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-zinc-50 text-zinc-400 line-through ring-zinc-200",
                )}
              >
                {d.selected ? "✓ " : ""}
                {d.label}
              </button>
            ))}
          </div>
          {reviewing ? (
            <Button
              size="sm"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await call(`/photos/${m.id}`, { body: { selected } });
                setBusy(false);
              }}
            >
              Das ist meins – übernehmen
            </Button>
          ) : status === "confirmed" ? (
            <p className="text-xs text-zinc-500">Übernommen ✓</p>
          ) : null}
        </div>
      )}
      {status === "error" && <p className="p-2.5 text-xs text-red-600">Foto konnte nicht analysiert werden.</p>}
    </div>
  );
}
