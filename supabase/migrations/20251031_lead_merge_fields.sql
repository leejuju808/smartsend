alter table public.leads
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists company text,
  add column if not exists title text,
  add column if not exists city text,
  add column if not exists state text;

