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
-- the host lets each one in (Sascha 29.10.2026: "the host must confirm the joining"): the list shows a reference, not
-- the code; a phone asks with it, the host's phone shows "… wants to join" – only once let in the phone gets the code
alter table public.golfos_shared_games add column if not exists near_ref text;
alter table public.golfos_shared_games add column if not exists near_requests jsonb not null default '{}'::jsonb;

create or replace function public.golfos_nearby_rounds(at_lat double precision, at_lon double precision) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare found_rounds jsonb;
begin
  update golfos_shared_games set near_lat = null, near_lon = null, near_until = null where near_until < now();
  select coalesce(jsonb_agg(x order by (x->>'dist')::numeric), '[]'::jsonb) into found_rounds from (
    select jsonb_build_object(
      'ref', near_ref,
      'name', game->>'name',
      'course', game->'course'->>'name',
      'host', coalesce(near_host, ''),
      'tournament', coalesce((game->>'tournament')::boolean, false),
      'mode', game->'format'->>'mode',
      'dist', round(d)) as x
    from (
      select *, 6371000 * sqrt(power(radians(near_lat - at_lat), 2) + power(cos(radians(at_lat)) * radians(near_lon - at_lon), 2)) as d
      from golfos_shared_games
      where near_until > now() and near_ref is not null and game->>'kind' = 'round-event'
    ) g
    where d <= coalesce(near_radius, 300)
    order by d
    limit 8
  ) t;
  return found_rounds;
end $$;
revoke all on function public.golfos_nearby_rounds(double precision, double precision) from public, anon;
grant execute on function public.golfos_nearby_rounds(double precision, double precision) to authenticated;

-- asks to join a round nearby – and, asked again, says how it stands: 'asked', 'no', 'gone' (no longer shown), or 'ok'
-- with the code (let in, or host or member already)
create or replace function public.golfos_request_join(join_ref text, who text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  r golfos_shared_games;
  me text := auth.uid()::text;
begin
  select * into r from golfos_shared_games where near_ref = join_ref and near_until > now();
  if not found then return jsonb_build_object('state', 'gone'); end if;
  if auth.uid() = r.owner or auth.uid() = any(r.members) then return jsonb_build_object('state', 'ok', 'code', r.code); end if;
  if r.near_requests ? me then return jsonb_build_object('state', r.near_requests->me->>'state'); end if;
  update golfos_shared_games
    set near_requests = near_requests || jsonb_build_object(me, jsonb_build_object('name', left(coalesce(who, ''), 60), 'at', now(), 'state', 'asked'))
    where code = r.code;
  return jsonb_build_object('state', 'asked');
end $$;
revoke all on function public.golfos_request_join(text, text) from public, anon;
grant execute on function public.golfos_request_join(text, text) to authenticated;

-- the host (or a member) lets one in or not; let in, he becomes a member
create or replace function public.golfos_answer_join(join_code text, player text, yes boolean) returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  update golfos_shared_games set
    near_requests = jsonb_set(near_requests, array[player], (near_requests->player) || jsonb_build_object('state', case when yes then 'ok' else 'no' end)),
    members = case when yes and not (player::uuid = any(members)) then array_append(members, player::uuid) else members end
    where code = upper(join_code) and (auth.uid() = owner or auth.uid() = any(members)) and near_requests ? player;
  return found;
end $$;
revoke all on function public.golfos_answer_join(text, text, boolean) from public, anon;
grant execute on function public.golfos_answer_join(text, text, boolean) to authenticated;
