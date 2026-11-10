-- GolfOS: the challenger changes his own 5+5+10 (Sascha 11.11.2026, USA: "the host can change everything – but Chris set
-- up the 5+5+10 and challenged me; so he must be able to change it afterwards too", e.g. gross → net 75 %). Run once in
-- the Supabase SQL editor of the GolfOS project, after golfos-duels2.sql – it replaces that guard; running it again does
-- no harm.
--
-- The guard of a pool of bets as golfos-duels2.sql has it, and besides: the player who challenged to a duel (5+5+10)
-- changes it – gross or net, the handicap share, the stakes, the day or round, who keeps the score – but never whose it
-- is, against whom, nor its challenge (accepted stays accepted). Declined, it is his no more. Everything else as it was.

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
  w jsonb;
  v jsonb;
  mine text[];
begin
  if o->>'kind' is distinct from 'wager-pool' then return new; end if;
  if auth.uid() is null or auth.uid() = old.owner then return new; end if; -- the host (or the server itself)
  if new.owner is distinct from old.owner or new.code is distinct from old.code then
    raise exception 'only the host changes the pool' using errcode = '42501';
  end if;
  if (n - 'progress' - 'players' - 'payments' - 'wagers' - 'cards') is distinct from (o - 'progress' - 'players' - 'payments' - 'wagers' - 'cards') then
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
  -- the players this account plays as (after the change – a join and a challenge can come together)
  select coalesce(array_agg(pl->>'id'), '{}') into mine from jsonb_array_elements(coalesce(n->'players', '[]'::jsonb)) pl
    where pl->'joined'->>'uid' = me;
  for i in had .. coalesce(jsonb_array_length(n->'players'), 0) - 1 loop
    p := n->'players'->i;
    if coalesce(p->'joined'->>'uid', '') = me then continue; end if;
    -- brought in with a duel (10.11.2026): nobody joined as him, a new duel of this account's player against him
    if p->'joined' is not null or not exists (
      select 1 from jsonb_array_elements(coalesce(n->'wagers', '[]'::jsonb)) x
      where x->>'opponent' = p->>'id' and x->>'kind' = 'nassau' and x->>'player' = any(mine)
        and not exists (select 1 from jsonb_array_elements(coalesce(o->'wagers', '[]'::jsonb)) y where y->>'id' = x->>'id')
    ) then
      raise exception 'a new player only by joining' using errcode = '42501';
    end if;
  end loop;
  -- the bets: the host's – but for the duels (5+5+10) a player challenges, takes back or answers
  for w in select x from jsonb_array_elements(coalesce(n->'wagers', '[]'::jsonb)) x loop
    select y into v from jsonb_array_elements(coalesce(o->'wagers', '[]'::jsonb)) y where y->>'id' = w->>'id' limit 1;
    if v is not distinct from w then continue; end if;
    if v is null then
      -- a new challenge: his own, against another player of the pool, open
      if w->>'kind' <> 'nassau' or not (w->>'player' = any(mine))
        or coalesce(w->>'opponent', '') = '' or w->>'opponent' = w->>'player'
        or not exists (select 1 from jsonb_array_elements(n->'players') pl where pl->>'id' = w->>'opponent')
        or not (
          coalesce(w->'challenge'->>'state', '') = 'open'
          or (coalesce(w->'challenge'->>'state', '') = 'accepted' and exists (
            select 1 from jsonb_array_elements(n->'players') pl
            where pl->>'id' = w->>'opponent' and pl->'joined' is null and pl->'invited' is null))
        ) then
        raise exception 'only the host adds a bet – a player only challenges to a duel' using errcode = '42501';
      end if;
    else
      -- the challenger changes his own duel (11.11.2026): all but whose, against whom and the challenge
      if v->>'kind' = 'nassau' and w->>'kind' = 'nassau' and v->>'player' = any(mine)
        and w->>'player' = v->>'player' and w->>'opponent' is not distinct from v->>'opponent'
        and (w->'challenge') is not distinct from (v->'challenge')
        and coalesce(v->'challenge'->>'state', '') <> 'declined' then
        continue;
      end if;
      -- an answer: only the challenge of an open duel to him, accepted or declined
      if v->>'kind' <> 'nassau' or (w - 'challenge') is distinct from (v - 'challenge') or not (v->>'opponent' = any(mine))
        or coalesce(v->'challenge'->>'state', '') <> 'open' or coalesce(w->'challenge'->>'state', '') not in ('accepted', 'declined') then
        raise exception 'only the host changes a bet – a player only answers a duel' using errcode = '42501';
      end if;
    end if;
  end loop;
  for v in select y from jsonb_array_elements(coalesce(o->'wagers', '[]'::jsonb)) y loop
    if exists (select 1 from jsonb_array_elements(coalesce(n->'wagers', '[]'::jsonb)) x where x->>'id' = v->>'id') then continue; end if;
    -- taken back: his own challenge, not accepted
    if v->>'kind' <> 'nassau' or not (v->>'player' = any(mine)) or coalesce(v->'challenge'->>'state', '') not in ('open', 'declined') then
      raise exception 'only the host removes a bet' using errcode = '42501';
    end if;
  end loop;
  -- the cards: each player's own
  for k in
    select jsonb_object_keys(coalesce(n->'cards', '{}'::jsonb))
    union
    select jsonb_object_keys(coalesce(o->'cards', '{}'::jsonb))
  loop
    if (n->'cards'->k) is not distinct from (o->'cards'->k) then continue; end if;
    if k = any(mine) then continue; end if;
    -- the opponent of a duel this account's player challenged and keeps the score of: only the cards marked as his
    -- entries change, every other one stays as it was
    if not exists (
      select 1 from jsonb_array_elements(coalesce(n->'wagers', '[]'::jsonb)) x
      where x->>'opponent' = k and x->>'player' = any(mine) and x->>'scorer' = 'by'
        and coalesce(x->'challenge'->>'state', '') <> 'declined'
    ) or exists (
      select 1 from jsonb_array_elements(coalesce(n->'cards'->k, '[]'::jsonb)) c
      where not (coalesce(c->>'rec', '') = any(mine))
        and not exists (select 1 from jsonb_array_elements(coalesce(o->'cards'->k, '[]'::jsonb)) d where d = c)
    ) or exists (
      select 1 from jsonb_array_elements(coalesce(o->'cards'->k, '[]'::jsonb)) d
      where not (coalesce(d->>'rec', '') = any(mine))
        and not exists (select 1 from jsonb_array_elements(coalesce(n->'cards'->k, '[]'::jsonb)) c where c = d)
    ) then
      raise exception 'a phone keeps only its own card' using errcode = '42501';
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
      select 1 from jsonb_array_elements(n->'wagers') x, jsonb_array_elements(n->'players') pl
      where x->>'id' = k and x->>'kind' <> 'free' and pl->>'id' = x->>'player' and pl->'joined'->>'uid' = me
    ) and not (
      -- a bet taken back: its progress goes with it
      (n->'progress'->k) is null and not exists (select 1 from jsonb_array_elements(coalesce(n->'wagers', '[]'::jsonb)) x where x->>'id' = k)
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
