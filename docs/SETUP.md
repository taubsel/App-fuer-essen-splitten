# Online stellen (ca. 10 Minuten)

Du brauchst drei Dinge: **Supabase** (Datenbank + Login), **Vercel** (Hosting) und deinen **OpenAI-Key** mit etwas Guthaben.
Alles läuft im kostenlosen Tarif – nur OpenAI kostet ein paar Cent pro Abend.

---

## 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) mit GitHub anmelden → **New project**
   - Name: `tischrechnung`
   - Database Password: „Generate“ klicken und irgendwo sicher speichern
   - Region: **Central EU (Frankfurt)**
2. Warten, bis das Projekt bereit ist (1–2 Minuten).
3. **Anonyme Anmeldung einschalten:** Authentication → *Sign In / Providers* → **Allow anonymous sign-ins** aktivieren → Save.
4. **Datenbank einrichten:** SQL Editor → *New query* → den kompletten Inhalt von
   [`supabase/migrations/20261109000000_init.sql`](../supabase/migrations/20261109000000_init.sql) hineinkopieren → **Run**.
   Es sollte „Success. No rows returned“ erscheinen.
5. **Schlüssel notieren:** Project Settings → *API Keys* (bzw. *Data API*):
   - **Project URL** (z. B. `https://abcd1234.supabase.co`)
   - **anon / publishable key** (darf öffentlich sein)
   - **service_role / secret key** (geheim! nur bei Vercel eintragen)

> Alternative zu Schritt 3 + 4: Erstelle unter *Account → Access Tokens* ein Token und gib es Claude über das sichere
> Formular – dann richtet Claude Datenbank und anonyme Anmeldung per API ein.

## 2. Auf Vercel deployen

1. Auf [vercel.com](https://vercel.com) mit GitHub anmelden → **Add New… → Project**
2. Repository **App-fuer-essen-splitten** importieren (ggf. Vercel Zugriff auf das Repo geben).
3. Framework wird automatisch als **Next.js** erkannt. Unter **Environment Variables** eintragen:

   | Name | Wert |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL aus Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
   | `OPENAI_API_KEY` | dein OpenAI-Key |

4. **Deploy** klicken. Nach ca. 1 Minute bekommst du eine Adresse wie `https://app-fuer-essen-splitten.vercel.app` –
   das ist eure App. Jeder weitere Push auf GitHub geht automatisch live.

## 3. OpenAI-Guthaben

Unter [platform.openai.com → Settings → Billing](https://platform.openai.com/settings/organization/billing/) ein paar Euro
aufladen (5–10 € reichen lange). Tipp: dort auch ein monatliches Limit setzen.

Optional lassen sich die Modelle per Umgebungsvariable wechseln: `OPENAI_MODEL` (Bilder & Zuordnung, Standard `gpt-5.5`) und
`OPENAI_MODEL_FAST` (Chat, Standard `gpt-5.4-mini`).

## 4. Testen

1. Die Vercel-Adresse auf dem Handy öffnen → **Neue Runde starten**
2. QR-Code mit einem zweiten Handy scannen → beitreten
3. Ein paar Sachen in den Chat schreiben, einen Bon fotografieren, fertig.

Tipp fürs Handy: Im Browser „Zum Home-Bildschirm hinzufügen“ – dann startet Tischrechnung wie eine App.

---

## Gut zu wissen

- **Supabase pausiert kostenlose Projekte** nach ca. einer Woche ohne Nutzung. Dann im Supabase-Dashboard auf „Restore“
  klicken – vor dem Urlaub einmal kurz öffnen.
- **Live-Updates** laufen über Supabase Realtime (öffentliche Broadcast-Kanäle, enthalten keine Daten). Falls sie nicht
  ankommen: Realtime → Settings → öffentlichen Zugriff erlauben. Zur Sicherheit aktualisiert sich die App zusätzlich alle 20 s.
- **Datenschutz:** Fotos liegen in einem privaten Supabase-Bucket und sind nur über kurzlebige, signierte Links sichtbar.
  Alte Runden lassen sich im Supabase-Dashboard (Table Editor → `sessions`) löschen; Fotos unter Storage → `photos`.
- **Kosten-Schutz:** pro Person maximal 12 Nachrichten und 4 Fotos pro Minute.
