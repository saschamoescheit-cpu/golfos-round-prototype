-- GolfOS Games: one game on several phones (Spec 021, Nachtrag I – Sascha 15.10.2026). Run once in the Supabase SQL
-- editor of the GolfOS project; running it again does no harm. The host shares a game with a 6-letter code, the others
-- join with it; every phone merges its copy every few seconds. Also used by the push notices "a player joined" /
-- "the game ended" (function golfos-push).

create table if not exists public.golfos_shared_games (
  code text primary key,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  members uuid[] not null default '{}',
  game jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.golfos_shared_games enable row level security;
drop policy if exists "host and members read" on public.golfos_shared_games;
create policy "host and members read" on public.golfos_shared_games for select to authenticated
  using (auth.uid() = owner or auth.uid() = any(members));
drop policy if exists "host creates" on public.golfos_shared_games;
create policy "host creates" on public.golfos_shared_games for insert to authenticated
  with check (auth.uid() = owner);
drop policy if exists "host and members write" on public.golfos_shared_games;
create policy "host and members write" on public.golfos_shared_games for update to authenticated
  using (auth.uid() = owner or auth.uid() = any(members));

-- join with the code only (no listing): adds the caller to the members, returns the game
create or replace function public.golfos_join_game(join_code text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare g jsonb;
begin
  update golfos_shared_games set members = array_append(members, auth.uid())
    where code = upper(join_code) and not (auth.uid() = any(members)) and auth.uid() <> owner;
  select game into g from golfos_shared_games where code = upper(join_code);
  return g;
end $$;
revoke all on function public.golfos_join_game(text) from public, anon;
grant execute on function public.golfos_join_game(text) to authenticated;
