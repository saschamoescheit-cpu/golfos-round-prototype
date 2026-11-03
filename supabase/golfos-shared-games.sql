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

-- join with the code only (no listing): a game adds the caller to the members and returns it; a round (Sascha
-- 30.10.2026: "the host must confirm every joining, by QR or code too") only to its host and the ones let in –
-- the others ask first (golfos_ask_join) and get {"kind": "ask-host"}; a tournament planned in Games (Sascha
-- 01.11.2026) as a game: its host hands out the code or the link on purpose – whoever has it is in at once, while it
-- is not deleted; a tournament series (Sascha 01.11.2026: "one code for the whole series"): in the series and in every
-- one of its rounds at once
create or replace function public.golfos_join_game(join_code text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare r golfos_shared_games;
begin
  select * into r from golfos_shared_games where code = upper(join_code);
  if not found or r.event_code is not null then return null; end if; -- a flight's row: only through its event
  if r.game->>'kind' = 'tour-series' then
    if coalesce(r.game->>'deletedAt', '') <> '' then return null; end if;
    update golfos_shared_games set members = array_append(members, auth.uid())
      where event_code is null and auth.uid() <> owner and not (auth.uid() = any(members))
        and (code = r.code or code in (select x->>'code' from jsonb_array_elements(coalesce(r.game->'rounds', '[]'::jsonb)) x));
    return r.game;
  end if;
  if r.game->>'kind' = 'round-event' then
    if auth.uid() = r.owner or auth.uid() = any(r.members) then return r.game; end if;
    if r.game->'planned' = 'true'::jsonb then
      if coalesce(r.game->>'deletedAt', '') <> '' then return null; end if;
      update golfos_shared_games set members = array_append(members, auth.uid())
        where code = r.code and not (auth.uid() = any(members));
      return r.game;
    end if;
    return jsonb_build_object('kind', 'ask-host');
  end if;
  update golfos_shared_games set members = array_append(members, auth.uid())
    where code = r.code and not (auth.uid() = any(members)) and auth.uid() <> owner;
  return r.game;
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
-- one request of a phone to a round, by its code or nearby (with the asker's name and handicap index, for the host's
-- list): 'asked' – or how it stands
create or replace function public.golfos_ask_row(r golfos_shared_games, who text, hcp text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare me text := auth.uid()::text;
begin
  if auth.uid() = r.owner or auth.uid() = any(r.members) then return jsonb_build_object('state', 'ok', 'code', r.code); end if;
  if r.near_requests ? me then return jsonb_build_object('state', r.near_requests->me->>'state'); end if;
  update golfos_shared_games
    set near_requests = near_requests || jsonb_build_object(me, jsonb_build_object('name', left(coalesce(who, ''), 60), 'hcp', left(coalesce(hcp, ''), 8), 'at', now(), 'state', 'asked'))
    where code = r.code;
  return jsonb_build_object('state', 'asked');
end $$;
revoke all on function public.golfos_ask_row(golfos_shared_games, text, text) from public, anon, authenticated;

drop function if exists public.golfos_request_join(text, text);
create or replace function public.golfos_request_join(join_ref text, who text, hcp text default null) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare r golfos_shared_games;
begin
  select * into r from golfos_shared_games where near_ref = join_ref and near_until > now();
  if not found then return jsonb_build_object('state', 'gone'); end if;
  return golfos_ask_row(r, who, hcp);
end $$;
revoke all on function public.golfos_request_join(text, text, text) from public, anon;
grant execute on function public.golfos_request_join(text, text, text) to authenticated;

-- asks to join a round by its code (QR, link, typed): as nearby, the host lets in; 'none' for no round with this code
create or replace function public.golfos_ask_join(join_code text, who text, hcp text default null) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare r golfos_shared_games;
begin
  select * into r from golfos_shared_games where code = upper(join_code);
  if not found or r.game->>'kind' is distinct from 'round-event' then return jsonb_build_object('state', 'none'); end if;
  return golfos_ask_row(r, who, hcp);
end $$;
revoke all on function public.golfos_ask_join(text, text, text) from public, anon;
grant execute on function public.golfos_ask_join(text, text, text) to authenticated;

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

-- One row per flight (Sascha 30.10.2026, the night run: "a tournament of 12 or more phones must not slow itself down"):
-- a round's event keeps its row (the code: name, holes, format), each flight its own row "<code>-<flight>" with the
-- flight's players and scores – the phones of a flight write only their row. Who may read and write a flight's row:
-- whoever may the event's (its host and the ones let in). Events from before keep their flights in the event's row.
alter table public.golfos_shared_games add column if not exists event_code text references public.golfos_shared_games(code) on delete cascade;
create index if not exists golfos_shared_games_event_idx on public.golfos_shared_games (event_code) where event_code is not null;

create or replace function public.golfos_in_event(ev text) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from golfos_shared_games e where e.code = ev and (auth.uid() = e.owner or auth.uid() = any(e.members)));
$$;
revoke all on function public.golfos_in_event(text) from public, anon;
grant execute on function public.golfos_in_event(text) to authenticated;

drop policy if exists "the event's players read its flights" on public.golfos_shared_games;
create policy "the event's players read its flights" on public.golfos_shared_games for select to authenticated
  using (event_code is not null and golfos_in_event(event_code));
drop policy if exists "the event's players start a flight" on public.golfos_shared_games;
create policy "the event's players start a flight" on public.golfos_shared_games for insert to authenticated
  with check (event_code is not null and auth.uid() = owner and golfos_in_event(event_code));
drop policy if exists "the event's players write its flights" on public.golfos_shared_games;
create policy "the event's players write its flights" on public.golfos_shared_games for update to authenticated
  using (event_code is not null and golfos_in_event(event_code));

-- Only the host changes a pool of bets (Sascha 01.11.2026: "the invited cannot edit or change the bets – only the host
-- who set them up; watertight"). A pool (kind 'wager-pool') is written by its host – the row's owner – as he likes; the
-- members only as the app does for them:
--   * joining: a player's "joined" set to their own account (a player not taken by another account), or themselves
--     added as a new player;
--   * reporting: the progress of their own bets (a bet of the player whose "joined" is their account) – never a decision
--     by hand, which is the host's.
-- Everything else – the name, the days, the money, the players, the bets, ended, deleted – stays as it was. The other
-- rows (games, rounds) are not touched by this.
create or replace function public.golfos_pool_guard() returns trigger
  language plpgsql set search_path = public as $$
declare
  o jsonb := old.game;
  n jsonb := new.game;
  me text := auth.uid()::text;
  had int;
  p jsonb;
  q jsonb;
  k text;
  pay jsonb;
begin
  if o->>'kind' is distinct from 'wager-pool' then return new; end if;
  if auth.uid() is null or auth.uid() = old.owner then return new; end if; -- the host (or the server itself)
  if new.owner is distinct from old.owner or new.code is distinct from old.code then
    raise exception 'only the host changes the pool' using errcode = '42501';
  end if;
  if (n - 'progress' - 'players' - 'payments') is distinct from (o - 'progress' - 'players' - 'payments') then
    raise exception 'only the host changes the pool' using errcode = '42501';
  end if;
  -- the players: each one as before, but for joining
  had := coalesce(jsonb_array_length(o->'players'), 0);
  if coalesce(jsonb_array_length(n->'players'), 0) < had then
    raise exception 'only the host removes a player' using errcode = '42501';
  end if;
  for i in 0 .. had - 1 loop
    p := o->'players'->i;
    q := n->'players'->i;
    if (q - 'joined') is distinct from (p - 'joined') then
      raise exception 'only the host changes a player' using errcode = '42501';
    end if;
    if (q->'joined') is distinct from (p->'joined') and (
      coalesce(q->'joined'->>'uid', '') <> me or coalesce(p->'joined'->>'uid', me) <> me
    ) then
      raise exception 'a player is joined only by their own account' using errcode = '42501';
    end if;
  end loop;
  for i in had .. coalesce(jsonb_array_length(n->'players'), 0) - 1 loop
    if coalesce(n->'players'->i->'joined'->>'uid', '') <> me then
      raise exception 'a new player only by joining' using errcode = '42501';
    end if;
  end loop;
  -- the progress: only of the own bets, and never a decision by hand
  for k in
    select jsonb_object_keys(coalesce(n->'progress', '{}'::jsonb))
    union
    select jsonb_object_keys(coalesce(o->'progress', '{}'::jsonb))
  loop
    if (n->'progress'->k) is not distinct from (o->'progress'->k) then continue; end if;
    if (n->'progress'->k->'manual') is distinct from (o->'progress'->k->'manual') then
      raise exception 'only the host decides a bet by hand' using errcode = '42501';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(n->'wagers') w, jsonb_array_elements(n->'players') pl
      where w->>'id' = k and w->>'kind' <> 'free' and pl->>'id' = w->>'player' and pl->'joined'->>'uid' = me
    ) then
      raise exception 'a phone reports only its own bets' using errcode = '42501';
    end if;
  end loop;
  -- the payments of the settlement (03.11.2026): a phone marks, confirms or takes back only what it paid or received
  for pay in
    select x from jsonb_array_elements(coalesce(n->'payments', '[]'::jsonb)) x
    where not exists (select 1 from jsonb_array_elements(coalesce(o->'payments', '[]'::jsonb)) y where y = x)
    union all
    select y from jsonb_array_elements(coalesce(o->'payments', '[]'::jsonb)) y
    where not exists (select 1 from jsonb_array_elements(coalesce(n->'payments', '[]'::jsonb)) x where x = y)
  loop
    if not exists (
      select 1 from jsonb_array_elements(n->'players') pl
      where pl->'joined'->>'uid' = me and pl->>'id' in (pay->>'from', pay->>'to')
    ) then
      raise exception 'a phone marks only its own payments' using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists golfos_pool_guard on public.golfos_shared_games;
create trigger golfos_pool_guard before update on public.golfos_shared_games
  for each row execute function public.golfos_pool_guard();
