# Plan & Architektur

## Ziel

Der Moment „einer muss 200 € vorstrecken und dann allen hinterherlaufen“ soll so klein wie möglich werden. Keine
Bezahlfunktion – jeder bekommt seinen Betrag ausgerechnet und überweist selbst (z. B. per PayPal).

## Ablauf einer Runde

```
Host startet Runde ──► QR/Link ──► alle treten bei (nur Name)
        │
        ▼
Während des Essens: Chat („2 Mythos, Gyros“) oder Tellerfoto ──► KI macht Notizen
        │
        ▼
Bon fotografieren ──► KI liest Positionen (Original + Deutsch), prüft Summe
        │
        ▼
KI-Zuordnung: Notizen ⇄ Positionen
   ├─ eindeutig → direkt zugeordnet
   └─ unklar/überbucht → Rückfrage an genau diese Person (Buttons oder Freitext)
        │
        ▼
Jeder prüft „Meine Positionen“ (Mengen, Teilen), bestätigt, sieht Betrag inkl. Trinkgeld
        │
        ▼
Host-Übersicht: offen / fehlt / überbucht → Rest verteilen → abschließen → Zusammenfassung in die Gruppe
```

## Datenmodell (Supabase/Postgres)

| Tabelle | Inhalt |
| --- | --- |
| `sessions` | Runde: Code, Titel, Host, Trinkgeld-%, Status (`open` → `assigning` → `closed`), Bon-Status, KI-Status |
| `participants` | Personen (anonyme Supabase-User) mit Name, Host-Flag, bestätigt/bezahlt |
| `messages` | Chat: Nachrichten, KI-Antworten, KI-Rückfragen (mit Optionen), Systemmeldungen, Fotos |
| `notes` | Was die KI aus Nachrichten/Fotos verstanden hat („2× Mythos, 0,5 l, geteilt mit …“) |
| `receipt_items` | Bon-Positionen: Original, Deutsch, Menge, Zeilensumme |
| `claims` | Wer übernimmt wie viel einer Position (Bruchteile für Geteiltes); Quelle `ai` / `manual` / `split` |

Zugriff: RLS an, **keine** Policies → nur der Server (Service-Key) liest/schreibt. API-Routen prüfen den anonymen
Supabase-Login und die Mitgliedschaft in der Runde.

## KI-Aufgaben (`src/lib/ai/tasks.ts`)

| Aufgabe | Modell | Wann |
| --- | --- | --- |
| `extractNotes` | schnell (`OPENAI_MODEL_FAST`) | jede Chat-Nachricht |
| `parseReceipt` | stark, Vision | Bon-Foto hochgeladen |
| `matchAll` | stark | nach dem Bon automatisch, oder Host drückt „KI zuordnen“ |
| `matchPerson` | stark | Freitext-Antwort auf Rückfrage / neue Nachricht, wenn der Bon schon da ist |
| `detectDishes` | stark, Vision | Tellerfoto |

Alle Antworten kommen als **Structured Outputs** (Zod-Schemas in `schemas.ts`). Positionen und Personen werden der KI mit
kurzen Referenzen (`I3`, `P2`) statt UUIDs gegeben; der Server prüft jede Antwort (unbekannte Referenzen, Mengen ≤ verfügbar).
Manuelle Zuordnungen und „Rest verteilen“ werden von der KI nie überschrieben.

## Phasen

| Phase | Inhalt | Status |
| --- | --- | --- |
| 0 | Grundgerüst, Datenbank, Zugriffsrechte, Testumgebung | ✅ |
| 1 | Runde erstellen/beitreten ohne Account, Live-Chat, KI-Notizen | ✅ |
| 2 | Bon fotografieren, Positionen auslesen/übersetzen/bearbeiten, Summenprüfung | ✅ |
| 3 | KI-Zuordnung, Rückfragen mit Buttons, Freitext-Antworten, Überbuchung erkennen | ✅ |
| 4 | Meine Positionen, Teilen, Trinkgeld, Host-Übersicht, Rest verteilen, Zusammenfassung | ✅ |
| 5 | Tellerfoto: KI markiert Speisen, Abwählen per Tipp, Spotlight | ✅ |
| 6 | Tests (Unit, E2E mit 3 Personen, KI-Eval), Doku, Online stellen | ✅ Code · ⏳ Deployment (siehe SETUP.md) |

## Ideen für später

- **Geräte wechseln:** Wer den Link erst im WhatsApp-Browser und dann in Safari öffnet, ist zweimal dabei. Lösung: „Auf
  anderem Gerät weitermachen“-QR mit Einmal-Token.
- **PayPal.me-Link des Hosts** hinterlegen → Button „Jetzt 23,10 € senden“ mit vorausgefülltem Betrag.
- **Mehrere Rechnungen pro Abend** (Getränke an der Bar extra).
- **Sprachnachricht** statt Tippen („zwei Mythos und ein Gyros“).
- **Accounts optional** (E-Mail/Apple-Login) für Verlauf über mehrere Abende und Salden à la Splitwise.
- **Push-Erinnerung** an Leute, die noch nichts eingetragen oder eine offene Rückfrage haben.
- **Automatisches Aufräumen** alter Runden und Fotos (z. B. nach 30 Tagen, per Supabase Cron).
- **Englische Oberfläche** für gemischte Gruppen.
