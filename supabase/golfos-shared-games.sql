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

-- Rounds nearby (Sascha 29.10.2026: "invite only people signed in with Google and nearby – by GPS"). The host's phone
-- puts where it is beside the code, for two hours; a signed-in phone within the circle sees the round under "Join a
-- round" and joins with a tap. Only the round is shown (name, course, the host's first name, the distance) – never a
-- position; a position past its two hours is forgotten by the next look-up.
alter table public.golfos_shared_games add column if not exists near_lat double precision;
alter table public.golfos_shared_games add column if not exists near_lon double precision;
alter table public.golfos_shared_games add column if not exists near_radius integer;
alter table public.golfos_shared_games add column if not exists near_host text check (length(near_host) <= 60);
alter table public.golfos_shared_games add column if not exists near_until timestamptz;

create or replace function public.golfos_nearby_rounds(at_lat double precision, at_lon double precision) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare found_rounds jsonb;
begin
  update golfos_shared_games set near_lat = null, near_lon = null, near_until = null where near_until < now();
  select coalesce(jsonb_agg(x order by (x->>'dist')::numeric), '[]'::jsonb) into found_rounds from (
    select jsonb_build_object(
      'code', code,
      'name', game->>'name',
      'course', game->'course'->>'name',
      'host', coalesce(near_host, ''),
      'tournament', coalesce((game->>'tournament')::boolean, false),
      'mode', game->'format'->>'mode',
      'dist', round(d)) as x
    from (
      select *, 6371000 * sqrt(power(radians(near_lat - at_lat), 2) + power(cos(radians(at_lat)) * radians(near_lon - at_lon), 2)) as d
      from golfos_shared_games
      where near_until > now() and game->>'kind' = 'round-event'
    ) g
    where d <= coalesce(near_radius, 300)
    order by d
    limit 8
  ) t;
  return found_rounds;
end $$;
revoke all on function public.golfos_nearby_rounds(double precision, double precision) from public, anon;
grant execute on function public.golfos_nearby_rounds(double precision, double precision) to authenticated;
