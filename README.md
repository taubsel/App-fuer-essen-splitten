# 🧾 Tischrechnung

**Restaurantrechnung für große Tische fair aufteilen – ohne dass einer 200 € vorstreckt und dann allen hinterherläuft.**

Ein Kassenzettel, zehn Leute, die Hälfte steht draußen zum Rauchen: Tischrechnung macht daraus eine Runde, der jeder per
QR-Code ohne Account beitritt. Jeder schreibt während des Essens kurz in den Chat, was er hatte („2 Mythos, Gyros“) oder macht
ein Foto vom Teller. Am Ende fotografiert der Host den Bon – die KI liest ihn (auch auf Griechisch oder handschriftlich), ordnet
alle Positionen den Leuten zu und fragt gezielt nach, wenn etwas unklar ist („0,3 l oder 0,5 l?“). Jeder sieht seinen Betrag inkl.
Trinkgeld und überweist dem Host per PayPal.

## Funktionen

- **Runde starten & beitreten** – Link, QR-Code oder 6-stelliger Code, nur mit Namen (anonyme Anmeldung, kein Passwort)
- **Live-Chat mit KI** – Nachrichten werden zu Notizen („📝 2× Mythos (0,5 l)“), Korrekturen („doch nur eins“) werden verstanden
- **Tellerfoto** – die KI markiert erkannte Speisen direkt auf dem Bild; was nicht deins ist, tippst du weg (Spotlight wie beim
  iOS-Freistellen)
- **Kassenzettel lesen** – Positionen, Mengen, Preise, Übersetzung ins Deutsche, Summenprüfung; mehrere Fotos für lange Bons
- **KI-Zuordnung mit Rückfragen** – eindeutige Sachen werden direkt zugeordnet; bei Unklarheiten oder Überbuchungen bekommt
  genau die betroffene Person eine Rückfrage mit Antwort-Buttons (oder antwortet frei im Chat)
- **Meine Positionen** – Mengen anpassen, Sachen teilen (½, ⅓ …), offene Positionen übernehmen, bestätigen, „bezahlt“ markieren
- **Host-Übersicht** – was ist offen, wer hat noch nichts eingetragen, wer hat offene Rückfragen, was ist überbucht;
  Trinkgeld-Prozentsatz für alle, „Rest gleichmäßig verteilen“, Zusammenfassung für WhatsApp kopieren
- **Centgenau** – Rabatte werden anteilig verteilt, Rundungsdifferenzen nach dem Verfahren der größten Reste

## Technik

| Teil | Wofür |
| --- | --- |
| [Next.js 16](https://nextjs.org) (App Router) + Tailwind 4 | Web-App, API-Routen |
| [Supabase](https://supabase.com) | anonyme Logins, Postgres, Foto-Speicher, Realtime-Broadcast für Live-Updates |
| [OpenAI](https://platform.openai.com) (Responses API, Structured Outputs) | Bon lesen, Chat verstehen, zuordnen, Fotos analysieren |
| Vercel | Hosting |

**Sicherheit:** Der Browser greift nie direkt auf die Datenbank zu (RLS an, keine Policies). Alle Zugriffe laufen über die
API-Routen, die den Supabase-Login prüfen und kontrollieren, ob man Teil der Runde ist. OpenAI- und Service-Keys liegen nur auf
dem Server. Live-Updates sind datenlose „refresh“-Pings.

Mehr Details: [`docs/PLAN.md`](docs/PLAN.md) (Architektur, Phasen, Ideen) · [`docs/SETUP.md`](docs/SETUP.md) (online stellen)

## Lokal entwickeln

Voraussetzungen: Node 22, Docker (für lokales Supabase).

```bash
npm install
npm run db:start            # startet Supabase lokal (Docker) und spielt die Migrationen ein
cp .env.example .env.local  # Werte aus der Ausgabe von db:start eintragen (API URL, anon key, service_role key)
npm run dev                 # http://localhost:3000
```

Ohne OpenAI-Guthaben: `AI_MOCK=1` in `.env.local` setzen – dann antwortet eine simple, simulierte KI.

## Tests

```bash
npm test          # Unit-Tests (Rechenlogik)
npm run test:e2e  # Playwright: 3 Personen spielen eine komplette Runde durch (mit simulierter KI)
npm run eval:ai   # prüft die ECHTE KI mit griechischem Beispiel-Bon, Chat-Beispielen und Tellerfoto (kostet ein paar Cent)
npm run typecheck && npm run lint
```

Testbilder erzeugen: `node e2e/fixtures/make-receipt.mjs`, `node e2e/fixtures/make-plate.mjs`.
