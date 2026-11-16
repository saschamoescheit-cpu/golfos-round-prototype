-- GolfOS: the green drawn round with the finger goes with a hole set up by hand (Sascha 16.11.2026, Hawks Landing 2 and
-- Legends: "mit dem Finger um das Grün malen" – "Gilt für alle"). One column more in golfos_course_lines: the outline of
-- the green (4–300 points [lon, lat]), or nothing. Run once in the Supabase SQL editor. Nothing existing is changed; the
-- app sends and reads the line alone until this is there.

alter table public.golfos_course_lines
  add column if not exists green jsonb
  check (green is null or (jsonb_typeof(green) = 'array' and jsonb_array_length(green) between 4 and 300));
