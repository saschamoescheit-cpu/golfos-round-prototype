-- GolfOS: way back from the 6-digit friend codes (supabase/golfos-friends.sql, 03.11.2026) – only if needed.
-- Run once in the Supabase SQL editor: every card gets its 12-character code from before again (cards made since keep
-- their 6 digits), and the functions are those from before. The friends and their links stay as they are.

update public.golfos_friend_cards set code = old_code, old_code = null where old_code is not null;

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
