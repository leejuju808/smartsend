alter table public.leads
  add column if not exists tags text[] default '{}';












