"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Card, TextInput, useToast } from "./ui";

interface MySession {
  code: string;
  title: string;
  status: string;
  created_at: string;
  myName: string;
  isHost: boolean;
}

const NAME_KEY = "tischrechnung-name";

export function Home() {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"start" | "create" | "join">("start");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [tip, setTip] = useState("10");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<MySession[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- gespeicherten Namen übernehmen
      if (saved) setName(saved);
    } catch {}
    api<{ sessions: MySession[] }>("/api/me/sessions")
      .then((r) => setMine(r.sessions))
      .catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      try {
        localStorage.setItem(NAME_KEY, name.trim());
      } catch {}
      const res = await api<{ code: string }>("/api/sessions", {
        body: {
          name,
          title: title.trim() || `Essen am ${new Date().toLocaleDateString("de-DE", { day: "numeric", month: "numeric" })}`,
          tipPercent: tip.replace(",", "."),
        },
      });
      router.push(`/s/${res.code}?neu=1`);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
      setBusy(false);
    }
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length < 4) return toast("Bitte den Code der Runde eingeben", "error");
    router.push(`/s/${c}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-10 pt-10">
      <div className="mb-8">
        <div className="mb-3 inline-flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-3xl shadow-sm">🧾</div>
        <h1 className="text-3xl font-bold tracking-tight">Tischrechnung</h1>
        <p className="mt-2 text-zinc-600">
          Eine Rechnung, zehn Leute, keiner blickt durch? Jeder schreibt kurz, was er hatte – die KI liest den Kassenzettel und
          rechnet aus, wer wie viel zahlt.
        </p>
      </div>

      {mode === "start" && (
        <div className="flex flex-col gap-3">
          <Button size="lg" onClick={() => setMode("create")}>
            Neue Runde starten
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setMode("join")}>
            Mit Code beitreten
          </Button>
        </div>
      )}

      {mode === "create" && (
        <Card>
          <form onSubmit={create} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Neue Runde</h2>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">Dein Name</span>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Julian" maxLength={40} required autoFocus />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">Name der Runde (optional)</span>
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Taverna Nikos" maxLength={80} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">Trinkgeld für alle</span>
              <div className="flex items-center gap-2">
                {["0", "5", "10", "15"].map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setTip(t)}
                    className={`flex-1 rounded-xl py-2.5 text-sm font-medium ring-1 ${
                      tip === t ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-zinc-200"
                    }`}
                  >
                    {t} %
                  </button>
                ))}
                <div className="relative w-20">
                  <TextInput
                    inputMode="decimal"
                    value={tip}
                    onChange={(e) => setTip(e.target.value)}
                    aria-label="Trinkgeld in Prozent"
                    className="pr-7 text-center"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">%</span>
                </div>
              </div>
              <span className="text-xs text-zinc-500">Jeder zahlt diesen Prozentsatz auf seinen Anteil drauf. Kannst du später ändern.</span>
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setMode("start")}>
                Zurück
              </Button>
              <Button type="submit" className="flex-1" loading={busy}>
                Runde starten
              </Button>
            </div>
          </form>
        </Card>
      )}

      {mode === "join" && (
        <Card>
          <form onSubmit={join} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Runde beitreten</h2>
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              className="text-center text-2xl font-semibold uppercase tracking-[0.3em]"
              maxLength={8}
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
            />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setMode("start")}>
                Zurück
              </Button>
              <Button type="submit" className="flex-1">
                Weiter
              </Button>
            </div>
            <p className="text-xs text-zinc-500">Am einfachsten: den QR-Code beim Host scannen oder den Link aus der Gruppe öffnen.</p>
          </form>
        </Card>
      )}

      {mine.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Deine Runden</h2>
          <ul className="flex flex-col gap-2">
            {mine.map((s) => (
              <li key={s.code}>
                <Link
                  href={`/s/${s.code}`}
                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-100 hover:bg-zinc-50"
                >
                  <div>
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs text-zinc-500">
                      {new Date(s.created_at).toLocaleDateString("de-DE")} · {s.isHost ? "Host" : s.myName} · {s.code}
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500">{s.status === "closed" ? "abgeschlossen" : "läuft"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12 grid gap-3 text-sm text-zinc-600">
        <Step n={1} text="Runde starten und den QR-Code in die Tischmitte legen – beitreten geht ohne Account." />
        <Step n={2} text="Während des Essens schreibt jeder in den Chat, was er hatte („2 Mythos, Gyros“) – oder macht ein Foto vom Teller." />
        <Step n={3} text="Am Ende den Kassenzettel fotografieren. Die KI ordnet alles zu und fragt nach, wenn etwas unklar ist." />
        <Step n={4} text="Jeder sieht seinen Betrag inklusive Trinkgeld und überweist dem Host – fertig." />
      </section>
    </main>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
        {n}
      </span>
      <p>{text}</p>
    </div>
  );
}
