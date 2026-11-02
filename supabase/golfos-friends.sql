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
  values (v, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)), coalesce(p_first, ''), coalesce(p_last, ''),
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
  c text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  update public.golfos_friend_cards set code = c, updated_at = now() where user_id = auth.uid();
  return c;
end $$;
revoke all on function public.golfos_friend_new_code() from public, anon;
grant execute on function public.golfos_friend_new_code() to authenticated;

-- who sent this code: name, club and photo for "Sascha wants to be your friend" – the handicap only once friends;
-- also before signing in (the link opened from WhatsApp)
create or replace function public.golfos_friend_preview(p_code text)
returns table (first_name text, last_name text, home_club text, photo text, is_me boolean, is_friend boolean)
language sql stable security definer set search_path = '' as $$
  select c.first_name, c.last_name, c.home_club, c.photo, c.user_id = auth.uid(),
         exists (select 1 from public.golfos_friend_links l where l.user_id = auth.uid() and l.friend_id = c.user_id)
  from public.golfos_friend_cards c where c.code = upper(trim(p_code));
$$;
revoke all on function public.golfos_friend_preview(text) from public;
grant execute on function public.golfos_friend_preview(text) to anon, authenticated;

-- accept: both are friends now (both directions); returns the friend's account
create or replace function public.golfos_friend_add(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v uuid := auth.uid();
  f uuid;
begin
  if v is null then
    raise exception 'not_signed_in';
  end if;
  select user_id into f from public.golfos_friend_cards where code = upper(trim(p_code));
  if f is null then
    raise exception 'unknown_code';
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
