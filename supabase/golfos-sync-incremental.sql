-- Incremental sync (prepared 14.11.2026, to run after the project is released on 01.12.2026): the server stamps every
-- write of golfos_items with its own time; the app then asks only for the rows written since its last sync instead of
-- the whole list every two minutes (src/lib/syncindex.ts). Safe to run twice. Nothing is deleted.
alter table public.golfos_items add column if not exists server_at timestamptz not null default now();

create or replace function public.golfos_items_server_at() returns trigger
language plpgsql as $$
begin
  new.server_at := now();
  return new;
end $$;

drop trigger if exists golfos_items_server_at on public.golfos_items;
create trigger golfos_items_server_at before insert or update on public.golfos_items
  for each row execute function public.golfos_items_server_at();

create index if not exists golfos_items_user_server_at on public.golfos_items (user_id, server_at);
