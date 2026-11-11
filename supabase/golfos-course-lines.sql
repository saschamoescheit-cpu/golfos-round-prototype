-- GolfOS: holes set up by hand, for every player of a course (Sascha 12.11.2026, night run: "the holes set up by hand on
-- the server – for every GolfOS user on that course"). A phone that sets a hole (tee → green) on a course without it
-- writes its line here; every phone loading that course takes the latest line of each hole its map lacks.
-- Stored: course id, hole ("loop#number"), the line (2–6 points [lon, lat]), who (only to change one's own), when.
-- Run once in the Supabase SQL editor. Nothing existing is changed.

create table if not exists public.golfos_course_lines (
  course_id text not null check (char_length(course_id) between 1 and 120),
  hole_key text not null check (hole_key ~ '^[A-Za-z0-9 ]{1,20}#[0-9]{1,2}$'),
  line jsonb not null check (jsonb_typeof(line) = 'array' and jsonb_array_length(line) between 2 and 6),
  by uuid not null default auth.uid(),
  at timestamptz not null default now(),
  primary key (course_id, hole_key, by)
);
create index if not exists golfos_course_lines_course on public.golfos_course_lines (course_id, at desc);

alter table public.golfos_course_lines enable row level security;

-- every signed-in player reads the lines (only course, hole, line and time are asked for)
drop policy if exists "players read course lines" on public.golfos_course_lines;
create policy "players read course lines" on public.golfos_course_lines for select to authenticated using (true);

-- each writes and changes only his own line of a hole
drop policy if exists "players add their course lines" on public.golfos_course_lines;
create policy "players add their course lines" on public.golfos_course_lines for insert to authenticated with check (by = auth.uid());
drop policy if exists "players change their course lines" on public.golfos_course_lines;
create policy "players change their course lines" on public.golfos_course_lines for update to authenticated using (by = auth.uid()) with check (by = auth.uid());
