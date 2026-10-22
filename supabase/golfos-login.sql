-- GolfOS: sign in with user name + password, besides Google (Sascha 22.10.2026, as in Schlaufuchs).
-- Run once in the Supabase SQL editor of the GolfOS project; running it again does no harm.
-- Supabase itself knows e-mail + password only: the user name is kept here, and the login function gives the e-mail
-- to a user name only with the right password (then the app signs in as usual).

-- User names
create table if not exists public.golfos_names (
  username text primary key check (username ~ '^[a-z0-9][a-z0-9._-]{2,19}$'),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.golfos_names enable row level security;
drop policy if exists "own name" on public.golfos_names;
create policy "own name" on public.golfos_names for select to authenticated using (auth.uid() = user_id);

-- Failed attempts per user name (against trying passwords); only the functions below read and write it.
create table if not exists public.golfos_login_fails (
  username text not null,
  at timestamptz not null default now()
);
alter table public.golfos_login_fails enable row level security;

-- A new account with a user name (from the app): the name is created with it. Taken: the whole account fails.
create or replace function public.golfos_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_user_meta_data ? 'golfos_username' then
    insert into public.golfos_names (username, user_id)
    values (lower(trim(new.raw_user_meta_data->>'golfos_username')), new.id);
  end if;
  return new;
end $$;
drop trigger if exists golfos_on_new_user on auth.users;
create trigger golfos_on_new_user after insert on auth.users
  for each row execute function public.golfos_new_user();
revoke all on function public.golfos_new_user() from public, anon, authenticated;

-- Is the user name still free?
create or replace function public.golfos_name_free(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.golfos_names where username = lower(trim(p_username)));
$$;
revoke all on function public.golfos_name_free(text) from public;
grant execute on function public.golfos_name_free(text) to anon, authenticated;

-- User name + password → the account's e-mail (only with the right password; then the normal sign-in).
-- After 10 failed attempts within 15 minutes the name is locked for a while.
create or replace function public.golfos_login_email(p_username text, p_password text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := lower(trim(p_username));
  v_email text;
  v_hash text;
begin
  if (select count(*) from public.golfos_login_fails where username = v_name and at > now() - interval '15 minutes') >= 10 then
    raise exception 'too_many_attempts';
  end if;
  select u.email, u.encrypted_password into v_email, v_hash
    from public.golfos_names n join auth.users u on u.id = n.user_id
    where n.username = v_name;
  if coalesce(v_hash, '') <> '' and extensions.crypt(p_password, v_hash) = v_hash then
    delete from public.golfos_login_fails where username = v_name;
    return v_email;
  end if;
  insert into public.golfos_login_fails (username) values (v_name);
  return null;
end $$;
revoke all on function public.golfos_login_email(text, text) from public;
grant execute on function public.golfos_login_email(text, text) to anon, authenticated;

-- Signed in (e.g. with Google): set or change the user name – then user name + password work too.
create or replace function public.golfos_set_username(p_username text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  insert into public.golfos_names (username, user_id)
  values (lower(trim(p_username)), auth.uid())
  on conflict (user_id) do update set username = excluded.username;
end $$;
revoke all on function public.golfos_set_username(text) from public, anon;
grant execute on function public.golfos_set_username(text) to authenticated;
