-- Tischrechnung – Grundschema
--
-- Zugriffskonzept: Alle Tabellen haben RLS aktiviert, aber KEINE Policies.
-- Browser-Clients (anon/authenticated) können also nichts direkt lesen oder schreiben.
-- Sämtliche Zugriffe laufen über die Next.js-API-Routen, die den Supabase-JWT des
-- (anonymen) Nutzers prüfen, die Mitgliedschaft in der Session kontrollieren und dann
-- mit dem Service-Role-Key arbeiten. Live-Updates kommen über einen Realtime-Broadcast
-- ("refresh"-Ping), der keinerlei Daten enthält.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Sessions (eine "Runde" = ein Tisch, eine Rechnung)
-- ---------------------------------------------------------------------------
create table public.sessions (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  title           text not null,
  host_user_id    uuid not null references auth.users (id) on delete cascade,
  tip_percent     numeric(5, 2) not null default 10 check (tip_percent >= 0 and tip_percent <= 100),
  currency        text not null default 'EUR',
  -- open: es wird gegessen und notiert · assigning: Bon ist da, es wird zugeordnet · closed: fertig
  status          text not null default 'open' check (status in ('open', 'assigning', 'closed')),
  -- Kassenzettel-Verarbeitung
  receipt_status  text not null default 'none' check (receipt_status in ('none', 'processing', 'ready', 'error')),
  receipt_error   text,
  receipt_total   numeric(10, 2),
  receipt_images  text[] not null default '{}',
  restaurant_name text,
  -- KI-Zuordnung über alle Personen
  match_status    text not null default 'idle' check (match_status in ('idle', 'running', 'error')),
  match_error     text,
  matched_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Teilnehmer (anonyme Supabase-User, nur mit Anzeigenamen)
-- ---------------------------------------------------------------------------
create table public.participants (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  is_host      boolean not null default false,
  confirmed_at timestamptz,
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (session_id, user_id)
);
create index participants_session_idx on public.participants (session_id);
create index participants_user_idx on public.participants (user_id);

-- ---------------------------------------------------------------------------
-- Chat: Nachrichten von Personen, Antworten der KI und Rückfragen der KI
-- ---------------------------------------------------------------------------
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  -- Autor (null bei KI/System)
  participant_id  uuid references public.participants (id) on delete cascade,
  kind            text not null check (kind in ('user', 'ai', 'question', 'system')),
  body            text not null,
  -- Bei KI-Antworten/Rückfragen: an wen richtet sich die Nachricht (null = alle)
  recipient_id    uuid references public.participants (id) on delete cascade,
  -- Rückfragen: open | answered | dismissed
  question_status text check (question_status in ('open', 'answered', 'dismissed')),
  -- Verarbeitung der Nachricht durch die KI: pending | done | error
  ai_status       text check (ai_status in ('pending', 'done', 'error')),
  image_path      text,
  -- Rückfrage-Optionen, gewählte Antwort, erkannte Gerichte auf Fotos etc.
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index messages_session_idx on public.messages (session_id, created_at);

-- ---------------------------------------------------------------------------
-- Notizen: von der KI aus Chat/Fotos extrahierte "Ich hatte …"-Einträge
-- ---------------------------------------------------------------------------
create table public.notes (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  message_id     uuid references public.messages (id) on delete set null,
  description    text not null,
  quantity       numeric(10, 3) not null default 1 check (quantity > 0),
  variant        text,
  shared_with    text[] not null default '{}',
  source         text not null default 'chat' check (source in ('chat', 'photo')),
  created_at     timestamptz not null default now()
);
create index notes_session_idx on public.notes (session_id);

-- ---------------------------------------------------------------------------
-- Positionen auf dem Kassenzettel
-- ---------------------------------------------------------------------------
create table public.receipt_items (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.sessions (id) on delete cascade,
  position      integer not null default 0,
  name_original text not null,
  name_de       text,
  quantity      numeric(10, 3) not null default 1 check (quantity > 0),
  -- Gesamtpreis der Zeile (kann bei Rabatten negativ sein)
  total_price   numeric(10, 2) not null,
  created_at    timestamptz not null default now()
);
create index receipt_items_session_idx on public.receipt_items (session_id, position);

-- ---------------------------------------------------------------------------
-- Zuordnungen: wer übernimmt wie viel von welcher Position
-- ---------------------------------------------------------------------------
create table public.claims (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete cascade,
  item_id        uuid not null references public.receipt_items (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  -- Anzahl Einheiten der Position (Bruchteile für geteilte Sachen erlaubt)
  quantity       numeric(10, 4) not null check (quantity > 0),
  -- ai: von der KI zugeordnet · manual: selbst/Host eingetragen · split: Rest verteilt
  source         text not null default 'manual' check (source in ('ai', 'manual', 'split')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (item_id, participant_id)
);
create index claims_session_idx on public.claims (session_id);

-- ---------------------------------------------------------------------------
-- RLS an, keine Policies => kein direkter Client-Zugriff
-- ---------------------------------------------------------------------------
alter table public.sessions      enable row level security;
alter table public.participants  enable row level security;
alter table public.messages      enable row level security;
alter table public.notes         enable row level security;
alter table public.receipt_items enable row level security;
alter table public.claims        enable row level security;

revoke all on public.sessions, public.participants, public.messages, public.notes,
  public.receipt_items, public.claims from anon, authenticated;

-- ---------------------------------------------------------------------------
-- updated_at automatisch pflegen
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger sessions_touch before update on public.sessions
  for each row execute function public.touch_updated_at();
create trigger claims_touch before update on public.claims
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Privater Storage-Bucket für Bon- und Tellerfotos (Zugriff nur serverseitig)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;
