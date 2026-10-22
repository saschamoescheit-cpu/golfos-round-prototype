-- GolfOS: course rating and slope shared between players (night run 22./23.10.2026, final list).
-- Run once in the Supabase SQL editor of the GolfOS project; running it again does no harm.
-- Everyone reads (they are the public figures of the club's scorecard); a signed-in player writes only his own rows.
-- The app takes, per course, loops and tee, the value most players agree on – men's and ladies' values apart.

create table if not exists public.golfos_ratings (
  course_id text not null check (length(course_id) <= 80),
  tee text not null check (length(tee) <= 20),
  loops text not null default '' check (length(loops) <= 20),
  lady boolean not null default false,
  cr numeric(4, 1) not null check (cr between 50 and 85),
  slope integer not null check (slope between 55 and 155),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (course_id, tee, loops, lady, user_id)
);
alter table public.golfos_ratings enable row level security;
drop policy if exists "everyone reads" on public.golfos_ratings;
create policy "everyone reads" on public.golfos_ratings for select to anon, authenticated using (true);
drop policy if exists "own rows" on public.golfos_ratings;
create policy "own rows" on public.golfos_ratings for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "own rows change" on public.golfos_ratings;
create policy "own rows change" on public.golfos_ratings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists golfos_ratings_course on public.golfos_ratings (course_id);
