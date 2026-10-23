-- GolfOS: push notifications (final list, Sascha 23.10.2026). Run once in the Supabase SQL editor of the GolfOS project,
-- AFTER the function golfos-push is deployed (supabase/functions/golfos-push/index.ts); running it again does no harm.
-- Only the function reads and writes these tables (with the service key) – the app talks to the function, so no row rules
-- for players are needed: row level security on, no policy = nobody else.

-- one row per phone that turned notifications on
create table if not exists public.golfos_push (
  endpoint text primary key check (length(endpoint) <= 1000),
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  kinds jsonb,              -- {"rounds":true,"games":true,"weather":true}; null = all on
  tz text,                  -- the phone's time zone, e.g. Europe/Berlin (reminders only in the day)
  lang text,                -- 'de' or 'en'
  round_at jsonb,           -- while a round is played: {lat,lng,course,since,until} for the thunderstorm warning
  updated_at timestamptz not null default now()
);
alter table public.golfos_push enable row level security;
create index if not exists golfos_push_user on public.golfos_push (user_id);

-- what was sent already (a round is reminded once, a storm once per round)
create table if not exists public.golfos_push_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (length(key) <= 200),
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.golfos_push_sent enable row level security;

-- the sender's key pair, made by the function the first time it runs (never leaves the server)
create table if not exists public.golfos_push_keys (
  id integer primary key check (id = 1),
  public_key text not null,
  private_jwk jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.golfos_push_keys enable row level security;

-- every 15 minutes: reminders and thunderstorm warnings
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.unschedule('golfos-push-tick') where exists (select 1 from cron.job where jobname = 'golfos-push-tick');
select cron.schedule(
  'golfos-push-tick',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://rgisfnilwehnqpmbrxmp.supabase.co/functions/v1/golfos-push',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{"action": "tick"}'::jsonb
     ) $$
);
