-- GolfOS: the live leaderboard for people outside (Sascha 08.11.2026, USA: "the live leaderboard also for people who
-- are not in the tournament – the same for games and bets"). Run once in the Supabase SQL editor of the GolfOS project;
-- running it again does no harm.
--
-- A tournament, a series, a game or a pool of bets gets a second code of its own: the watch code. It is long (not
-- guessable), only for looking, and switched on and off by its players – off, the link is dead at once. Whoever opens
-- the link sees the leaderboard without the app and without signing in. The join code stays as it is and is never
-- given out by this: whoever only watches never becomes a member.
--
-- What a watcher gets is cut down here, on the server: no accounts, no phones, no join requests, no positions; a pool's
-- or a game's money only when its players switched "Beträge zeigen" on (Sascha: off by default).

alter table public.golfos_shared_games add column if not exists live text unique;
alter table public.golfos_shared_games add column if not exists live_money boolean not null default false;

-- a flight as a watcher sees it: its players and scores – not its phones, its accounts, who keeps the card
create or replace function public.golfos_live_flight(f jsonb) returns jsonb
  language sql immutable as $$
  select f - 'phones' - 'keeper' - 'by'
$$;

-- a tournament (an event) with all its flights – those in its row and those in rows of their own – for watchers
create or replace function public.golfos_live_event(ev_code text) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  g jsonb;
  fl jsonb;
  r record;
begin
  select game into g from golfos_shared_games where code = ev_code;
  if g is null or g->>'kind' is distinct from 'round-event' then return null; end if;
  select coalesce(jsonb_object_agg(key, golfos_live_flight(value)), '{}'::jsonb) into fl
    from jsonb_each(case when jsonb_typeof(g->'flights') = 'object' then g->'flights' else '{}'::jsonb end);
  for r in select game->'flight' as f from golfos_shared_games where event_code = ev_code and game->>'kind' = 'round-flight' loop
    if r.f->>'id' is not null then fl := fl || jsonb_build_object(r.f->>'id', golfos_live_flight(r.f)); end if;
  end loop;
  return (g - 'by' - 'flights') || jsonb_build_object('flights', fl);
end $$;
revoke all on function public.golfos_live_event(text) from public, anon, authenticated;

-- a pool of bets for watchers: no accounts, no payments; without money: no stakes, a "5+5+10" only who is ahead
create or replace function public.golfos_live_pool(g jsonb, money boolean) returns jsonb
  language plpgsql immutable as $$
declare o jsonb := g - 'payments';
begin
  o := jsonb_set(o, '{players}', (select coalesce(jsonb_agg(p - 'joined' - 'invited'), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(g->'players') = 'array' then g->'players' else '[]'::jsonb end) p));
  if not money then
    o := jsonb_set(o, '{wagers}', (select coalesce(jsonb_agg(w - 'stake' - 'parts'), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(g->'wagers') = 'array' then g->'wagers' else '[]'::jsonb end) w));
    o := jsonb_set(o, '{progress}', (select coalesce(jsonb_object_agg(key,
           case when jsonb_typeof(value->'amount') = 'number' then jsonb_set(value, '{amount}', to_jsonb(sign((value->>'amount')::numeric))) else value end), '{}'::jsonb)
         from jsonb_each(case when jsonb_typeof(g->'progress') = 'object' then g->'progress' else '{}'::jsonb end)));
  end if;
  return o;
end $$;
revoke all on function public.golfos_live_pool(jsonb, boolean) from public, anon, authenticated;

-- a game for watchers: its players, scores and holes; not the phones' claims, the round behind it, the payments; without
-- money its stakes at 0 (the standing then shows no money)
create or replace function public.golfos_live_game(g jsonb, money boolean) returns jsonb
  language plpgsql immutable as $$
declare o jsonb := g - 'payments' - 'claims' - 'stamps' - 'round' - 'shared' - 'ownDetails';
begin
  if not money and jsonb_typeof(g->'settings') = 'object' then
    o := jsonb_set(o, '{settings}', (select coalesce(jsonb_object_agg(key, case when key in ('stake', 'front', 'back', 'total', 'maxStake') then '0'::jsonb else value end), '{}'::jsonb) from jsonb_each(g->'settings')));
  end if;
  return o;
end $$;
revoke all on function public.golfos_live_game(jsonb, boolean) from public, anon, authenticated;

-- what a watcher sees, by the watch code – null for a code switched off, unknown or deleted. Anyone may call it.
create or replace function public.golfos_live(live_code text) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  r golfos_shared_games;
  k text;
begin
  if live_code is null or length(live_code) < 16 then return null; end if;
  select * into r from golfos_shared_games where live = live_code and event_code is null;
  if not found or coalesce(r.game->>'deletedAt', '') <> '' then return null; end if;
  k := r.game->>'kind';
  if k = 'round-event' then
    return jsonb_build_object('kind', 'event', 'event', golfos_live_event(r.code), 'at', now());
  elsif k = 'tour-series' then
    return jsonb_build_object('kind', 'series', 'series', r.game, 'at', now(),
      'events', (select coalesce(jsonb_agg(golfos_live_event(x->>'code') order by x->>'date'), '[]'::jsonb)
                 from jsonb_array_elements(case when jsonb_typeof(r.game->'rounds') = 'array' then r.game->'rounds' else '[]'::jsonb end) x));
  elsif k = 'wager-pool' then
    return jsonb_build_object('kind', 'pool', 'pool', golfos_live_pool(r.game, r.live_money), 'money', r.live_money, 'at', now());
  elsif k is null and jsonb_typeof(r.game->'players') = 'array' and jsonb_typeof(r.game->'scores') = 'object' then
    return jsonb_build_object('kind', 'game', 'game', golfos_live_game(r.game, r.live_money), 'money', r.live_money, 'at', now());
  end if;
  return null;
end $$;
revoke all on function public.golfos_live(text) from public;
grant execute on function public.golfos_live(text) to anon, authenticated;

-- a player (the host or a member) switches watching on or off, shows the money or not, or makes a new link (the old one
-- dead). Returns the watch code – '' when switched off, null when not allowed or not found.
create or replace function public.golfos_live_set(row_code text, turn_on boolean, money boolean default false, renew boolean default false) returns text
  language plpgsql security definer set search_path = public as $$
declare
  r golfos_shared_games;
  c text;
begin
  select * into r from golfos_shared_games where code = upper(row_code) and event_code is null;
  if not found or auth.uid() is null or not (auth.uid() = r.owner or auth.uid() = any(r.members)) then return null; end if;
  if not turn_on then
    update golfos_shared_games set live = null, live_money = false where code = r.code;
    return '';
  end if;
  c := case when r.live is null or renew then substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 24) else r.live end;
  update golfos_shared_games set live = c, live_money = coalesce(money, false) where code = r.code;
  return c;
end $$;
revoke all on function public.golfos_live_set(text, boolean, boolean, boolean) from public, anon;
grant execute on function public.golfos_live_set(text, boolean, boolean, boolean) to authenticated;

-- how it stands (for the switch in the app): the watch code and the money – for the host and the members only
create or replace function public.golfos_live_state(row_code text) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare r golfos_shared_games;
begin
  select * into r from golfos_shared_games where code = upper(row_code) and event_code is null;
  if not found or auth.uid() is null or not (auth.uid() = r.owner or auth.uid() = any(r.members)) then return null; end if;
  return jsonb_build_object('live', r.live, 'money', r.live_money);
end $$;
revoke all on function public.golfos_live_state(text) from public, anon;
grant execute on function public.golfos_live_state(text) to authenticated;
