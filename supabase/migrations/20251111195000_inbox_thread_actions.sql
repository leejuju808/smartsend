-- Smart Actions support: track last action on threads and optional campaign booking links

alter table public.inbox_threads
  add column if not exists last_action text,
  add column if not exists last_action_at timestamptz;

alter table public.campaigns
  add column if not exists booking_link text;





