-- GolfOS: app errors reported by the app itself (final list, Sascha 22.10.2026 – the test in the USA).
-- Run once in the Supabase SQL editor of the GolfOS project; running it again does no harm.
-- The app only writes (never reads): what went wrong, where in the app, version and phone – no rounds, no positions.
-- Read them in Supabase: Table Editor → golfos_errors (newest first).

create table if not exists public.golfos_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text check (kind in ('crash', 'error', 'promise')),
  message text check (length(message) <= 500),
  stack text check (length(stack) <= 2000),
  version text check (length(version) <= 40),
  ua text check (length(ua) <= 300),
  screen text check (length(screen) <= 20),
  module text check (length(module) <= 20),
  username text check (length(username) <= 20)
);
alter table public.golfos_errors enable row level security;
drop policy if exists "report only" on public.golfos_errors;
create policy "report only" on public.golfos_errors for insert to anon, authenticated with check (true);
-- no select policy: only the project owner reads them in the dashboard
create index if not exists golfos_errors_at on public.golfos_errors (at desc);
