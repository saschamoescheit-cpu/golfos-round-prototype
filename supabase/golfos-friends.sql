-- GolfOS: friends linked by their accounts (Sascha 02.11.2026: "the handicaps of friends change – everyone keeps his in
-- his profile; link friends so that they come from their accounts"). Run once in the Supabase SQL editor of the GolfOS
-- project; running it again does no harm. Only new tables and functions – nothing existing is changed.
--
-- Every account has a friend card (name, handicap index, home club, photo – from its profile) with a friend code. Who
-- shows his QR code or sends his link agrees; the other accepts (golfos_friend_add) – then both are friends and read
-- each other's card, nobody else. Removing (golfos_friend_remove) ends it for both.

create table if not exists public.golfos_friend_cards (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  first_name text not null default '',
  last_name text not null default '',
  hcp_index text not null default '',
  home_club text not null default '',
  photo text check (photo is null or length(photo) <= 300000), -- a URL or a small JPEG as data URL
  updated_at timestamptz not null default now()
);
create table if not exists public.golfos_friend_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
alter table public.golfos_friend_cards enable row level security;
alter table public.golfos_friend_links enable row level security;

-- 6 digits, shown 123-456 (Sascha 03.11.2026: "12 characters are a lot – only digits, XXX-XXX"). The 12-character
-- code from before stays valid in old_code: QR codes and invitations already sent keep working.
alter table public.golfos_friend_cards add column if not exists old_code text unique;
-- 6 digits are quickly tried one after the other: wrong codes are counted – 15 in an hour per account (or address)
create table if not exists public.golfos_friend_tries (
  who text not null,
  at timestamptz not null default now()
);
create index if not exists golfos_friend_tries_who on public.golfos_friend_tries (who, at);
alter table public.golfos_friend_tries enable row level security; -- no policy: only the functions below touch it

-- a new code: 6 digits from the random of gen_random_uuid, none taken (old ones neither)
create or replace function public.golfos_friend_fresh_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  c text;
begin
  loop
    c := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 7))::bit(28)::int) % 1000000)::text, 6, '0');
    exit when not exists (select 1 from public.golfos_friend_cards where code = c or old_code = c);
  end loop;
  return c;
end $$;
revoke all on function public.golfos_friend_fresh_code() from public, anon, authenticated;

-- whose card a typed or scanned code is (123-456, 123456, the old 12 characters); a wrong one is counted
create or replace function public.golfos_friend_find(p_code text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  w text := coalesce(auth.uid()::text,
    nullif(trim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), ''), 'anon');
  c text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  f uuid;
begin
  if (select count(*) from public.golfos_friend_tries t where t.who = w and t.at > now() - interval '1 hour') >= 15 then
    raise exception 'too_many';
  end if;
  select user_id into f from public.golfos_friend_cards where code = c or old_code = c limit 1;
  if f is null then
    delete from public.golfos_friend_tries where at < now() - interval '1 day';
    insert into public.golfos_friend_tries (who) values (w);
  end if;
  return f;
end $$;
revoke all on function public.golfos_friend_find(text) from public, anon, authenticated;

-- the cards from before: a 6-digit code each, the old one kept (runs once; again it finds nothing to do)
do $$
declare
  r record;
begin
  for r in select user_id, code from public.golfos_friend_cards where code !~ '^[0-9]{6}$' loop
    update public.golfos_friend_cards set old_code = coalesce(old_code, r.code), code = public.golfos_friend_fresh_code()
    where user_id = r.user_id;
  end loop;
end $$;

-- reading: the own card and the cards of one's friends; writing only by the functions below
drop policy if exists "own and friends read" on public.golfos_friend_cards;
create policy "own and friends read" on public.golfos_friend_cards for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.golfos_friend_links l where l.user_id = auth.uid() and l.friend_id = golfos_friend_cards.user_id));
drop policy if exists "own links read" on public.golfos_friend_links;
create policy "own links read" on public.golfos_friend_links for select to authenticated
  using (user_id = auth.uid());

-- the own card from the profile; makes the friend code the first time and returns it
create or replace function public.golfos_friend_card_save(p_first text, p_last text, p_hcp text, p_club text, p_photo text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v uuid := auth.uid();
  c text;
begin
  if v is null then
    raise exception 'not_signed_in';
  end if;
  insert into public.golfos_friend_cards (user_id, code, first_name, last_name, hcp_index, home_club, photo, updated_at)
  values (v, public.golfos_friend_fresh_code(), coalesce(p_first, ''), coalesce(p_last, ''),
          coalesce(p_hcp, ''), coalesce(p_club, ''), p_photo, now())
  on conflict (user_id) do update set first_name = excluded.first_name, last_name = excluded.last_name,
    hcp_index = excluded.hcp_index, home_club = excluded.home_club, photo = excluded.photo, updated_at = now()
  returning code into c;
  return c;
end $$;
revoke all on function public.golfos_friend_card_save(text, text, text, text, text) from public, anon;
grant execute on function public.golfos_friend_card_save(text, text, text, text, text) to authenticated;

-- a new friend code (the old QR code and links stop working; friends stay friends)
create or replace function public.golfos_friend_new_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  c text := public.golfos_friend_fresh_code();
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  -- the old one stops working too
  update public.golfos_friend_cards set code = c, old_code = null, updated_at = now() where user_id = auth.uid();
  return c;
end $$;
revoke all on function public.golfos_friend_new_code() from public, anon;
grant execute on function public.golfos_friend_new_code() to authenticated;

-- who sent this code: name, club and photo for "Sascha wants to be your friend" – the handicap only once friends;
-- also before signing in (the link opened from WhatsApp); no row: no such code (counted)
create or replace function public.golfos_friend_preview(p_code text)
returns table (first_name text, last_name text, home_club text, photo text, is_me boolean, is_friend boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  f uuid := public.golfos_friend_find(p_code);
begin
  return query
  select c.first_name, c.last_name, c.home_club, c.photo, c.user_id = auth.uid(),
         exists (select 1 from public.golfos_friend_links l where l.user_id = auth.uid() and l.friend_id = c.user_id)
  from public.golfos_friend_cards c where c.user_id = f;
end $$;
revoke all on function public.golfos_friend_preview(text) from public;
grant execute on function public.golfos_friend_preview(text) to anon, authenticated;

-- accept: both are friends now (both directions); returns the friend's account – null: no such code (counted; an
-- error would undo the count)
create or replace function public.golfos_friend_add(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v uuid := auth.uid();
  f uuid;
begin
  if v is null then
    raise exception 'not_signed_in';
  end if;
  f := public.golfos_friend_find(p_code);
  if f is null then
    return null;
  end if;
  if f = v then
    raise exception 'own_code';
  end if;
  insert into public.golfos_friend_links (user_id, friend_id) values (v, f), (f, v) on conflict do nothing;
  return f;
end $$;
revoke all on function public.golfos_friend_add(text) from public, anon;
grant execute on function public.golfos_friend_add(text) to authenticated;

-- remove: for both
create or replace function public.golfos_friend_remove(p_friend uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  delete from public.golfos_friend_links
  where (user_id = auth.uid() and friend_id = p_friend) or (user_id = p_friend and friend_id = auth.uid());
end $$;
revoke all on function public.golfos_friend_remove(uuid) from public, anon;
grant execute on function public.golfos_friend_remove(uuid) to authenticated;
