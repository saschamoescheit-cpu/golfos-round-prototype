-- GolfOS: delete the own account from the app (final list, Sascha 22.10.2026 – Apple requires it, and the GDPR).
-- Run once in the Supabase SQL editor of the GolfOS project; running it again does no harm.
-- Only the signed-in player deletes, only his own account: his synced data (golfos_items), his user name
-- (golfos_names, by its foreign key) and the account itself. The data on his phone stay – the app never deletes them.

create or replace function public.golfos_delete_me() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'not_signed_in';
  end if;
  delete from public.golfos_items where user_id = v;
  delete from auth.users where id = v;
end $$;
revoke all on function public.golfos_delete_me() from public, anon;
grant execute on function public.golfos_delete_me() to authenticated;
