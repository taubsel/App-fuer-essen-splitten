"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useSessionState } from "@/lib/client/useSessionState";
import { Avatar, Button, Card, Sheet, Spinner, TextInput, cx, useToast } from "../ui";
import { ChatTab } from "./ChatTab";
import { SessionProvider, useSession } from "./context";
import { MeTab } from "./MeTab";
import { OverviewTab } from "./OverviewTab";
import { ReceiptTab } from "./ReceiptTab";

export type Tab = "chat" | "bon" | "ich" | "uebersicht";

export function SessionApp({ code }: { code: string }) {
  const { state, status, error, refresh } = useSessionState(code);

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center text-brand-600">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (status === "not-found") {
    return (
      <Centered>
        <p className="text-4xl">🤷</p>
        <h1 className="text-xl font-semibold">Runde nicht gefunden</h1>
        <p className="text-zinc-600">
          Die Runde {code} gibt es nicht (mehr) – entweder vertippt, oder der Host hat sie gelöscht.
        </p>
        <Link href="/" className="font-medium text-brand-700">
          Zur Startseite
        </Link>
      </Centered>
    );
  }
  if (status === "not-member") return <JoinScreen code={code} onJoined={refresh} />;
  if (status === "error" || !state) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Verbindung klappt gerade nicht</h1>
        <p className="text-zinc-600">{error}</p>
        <Button onClick={() => void refresh()}>Nochmal versuchen</Button>
      </Centered>
    );
  }
  return (
    <SessionProvider state={state} code={code} refresh={refresh}>
      <SessionShell />
    </SessionProvider>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-3 px-6 text-center">{children}</div>;
}

// ---------------------------------------------------------------------------
// Beitreten
// ---------------------------------------------------------------------------

interface Lookup {
  title: string;
  hostName: string | null;
  participantNames: string[];
  status: string;
}

function JoinScreen({ code, onJoined }: { code: string; onJoined: () => Promise<void> }) {
  const toast = useToast();
  const [info, setInfo] = useState<Lookup | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("tischrechnung-name");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- gespeicherten Namen übernehmen
      if (saved) setName(saved);
    } catch {}
    api<Lookup>(`/api/sessions/${code}`, { auth: false })
      .then(setInfo)
      .catch(() => {});
  }, [code]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      try {
        localStorage.setItem("tischrechnung-name", name.trim());
      } catch {}
      await api(`/api/sessions/${code}/join`, { body: { name } });
      await onJoined();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <Card className="p-6">
        <p className="text-sm font-medium text-brand-700">Du wurdest eingeladen 🍽️</p>
        {info ? (
          <h1 className="mt-1 text-2xl font-bold">{info.title}</h1>
        ) : (
          <div className="mt-2 h-7 w-48 animate-pulse rounded-lg bg-zinc-100" aria-label="lädt" />
        )}
        {info?.hostName && <p className="mt-1 text-zinc-600">Host: {info.hostName}</p>}
        {info && info.participantNames.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {info.participantNames.map((n) => (
              <span key={n} className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 py-0.5 pl-0.5 pr-2.5 text-sm">
                <Avatar name={n} size="sm" /> {n}
              </span>
            ))}
          </div>
        )}
        <form onSubmit={join} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700">Wie heißt du?</span>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Dein Name" maxLength={40} required autoFocus />
          </label>
          <Button type="submit" size="lg" loading={busy} disabled={info?.status === "closed"}>
            Beitreten
          </Button>
          {info?.status === "closed" && <p className="text-sm text-zinc-500">Diese Runde ist schon abgeschlossen.</p>}
          <p className="text-xs text-zinc-500">Kein Account nötig. Dein Gerät merkt sich, dass du dabei bist.</p>
        </form>
      </Card>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Hauptansicht mit Tabs
// ---------------------------------------------------------------------------

function SessionShell() {
  const { state, isHost, settlement } = useSession();
  const search = useSearchParams();
  const [tab, setTab] = useState<Tab>("chat");
  const [shareOpen, setShareOpen] = useState(search.get("neu") === "1");

  const openQuestions = state.messages.filter(
    (m) => m.kind === "question" && m.question_status === "open" && m.recipient_id === state.me.id,
  ).length;
  const myTotal = settlement.participants[state.me.id]?.total ?? 0;

  return (
    <div className="mx-auto flex h-dvh w-full max-w-lg flex-col bg-sand-50">
      <header className="flex items-center gap-3 border-b border-zinc-200/70 bg-white/90 px-4 py-3 backdrop-blur">
        <Link href="/" className="-ml-1 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100" aria-label="Startseite">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold leading-tight">{state.session.title}</h1>
          <p className="truncate text-xs text-zinc-500">
            {state.participants.length} {state.participants.length === 1 ? "Person" : "Personen"} · Code {state.session.code}
            {state.session.status === "closed" && " · abgeschlossen"}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setShareOpen(true)}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Einladen
        </Button>
      </header>

      <div className="min-h-0 flex-1">
        {tab === "chat" && <ChatTab />}
        {tab === "bon" && <ReceiptTab />}
        {tab === "ich" && <MeTab goTo={setTab} />}
        {tab === "uebersicht" && <OverviewTab />}
      </div>

      <nav className="pb-safe grid grid-cols-4 border-t border-zinc-200/70 bg-white pt-1">
        <TabButton active={tab === "chat"} onClick={() => setTab("chat")} label="Chat" badge={openQuestions || undefined}>
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" strokeLinejoin="round" />
        </TabButton>
        <TabButton
          active={tab === "bon"}
          onClick={() => setTab("bon")}
          label="Bon"
          dot={state.session.receipt_status === "processing"}
        >
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" strokeLinecap="round" strokeLinejoin="round" />
        </TabButton>
        <TabButton
          active={tab === "ich"}
          onClick={() => setTab("ich")}
          label={state.items.length ? fmtShort(myTotal) : "Ich"}
        >
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" strokeLinecap="round" />
        </TabButton>
        <TabButton active={tab === "uebersicht"} onClick={() => setTab("uebersicht")} label={isHost ? "Host" : "Übersicht"}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
        </TabButton>
      </nav>

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}

function fmtShort(n: number) {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function TabButton({
  active,
  onClick,
  label,
  badge,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cx("relative flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium", active ? "text-brand-700" : "text-zinc-500")}
      aria-current={active ? "page" : undefined}
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        {children}
      </svg>
      <span className="max-w-full truncate px-1">{label}</span>
      {badge !== undefined && (
        <span className="absolute right-[calc(50%-20px)] top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
          {badge}
        </span>
      )}
      {dot && <span className="absolute right-[calc(50%-16px)] top-1 size-2 animate-pulse rounded-full bg-brand-500" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Einladen: QR-Code, Link, Code
// ---------------------------------------------------------------------------

function ShareSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useSession();
  const toast = useToast();
  const [url, setUrl] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL ist erst im Browser bekannt
    setUrl(`${window.location.origin}/s/${state.session.code}`);
  }, [state.session.code]);

  async function share() {
    const text = `Komm in unsere Runde „${state.session.title}“ – trag ein, was du hattest, dann ist die Rechnung schnell aufgeteilt:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: state.session.title, text, url });
        return;
      } catch {}
    }
    await navigator.clipboard?.writeText(`${text} ${url}`);
    toast("Link kopiert");
  }

  return (
    <Sheet open={open} onClose={onClose} title="Leute einladen">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200">{url && <QRCodeSVG value={url} size={200} marginSize={1} />}</div>
        <p className="text-center text-sm text-zinc-600">QR-Code scannen lassen – beitreten geht ohne Account.</p>
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Code</div>
          <div className="text-3xl font-bold tracking-[0.25em]">{state.session.code}</div>
        </div>
        <div className="flex w-full gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={async () => {
              await navigator.clipboard?.writeText(url);
              toast("Link kopiert");
            }}
          >
            Link kopieren
          </Button>
          <Button className="flex-1" onClick={share}>
            Teilen
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
