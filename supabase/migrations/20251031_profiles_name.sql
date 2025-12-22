-- Ensure profiles table has name column
alter table if exists public.profiles add column if not exists name text;

