alter table public.campaigns
  add column if not exists account_id uuid references public.accounts (id) on delete set null,
  add column if not exists from_name text,
  add column if not exists from_email text;



