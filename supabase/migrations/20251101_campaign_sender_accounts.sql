-- Link campaigns → sender_accounts
alter table if exists public.campaigns
  add column if not exists sender_account_id uuid references public.sender_accounts(id);

create index if not exists campaigns_sender_idx on public.campaigns (sender_account_id);

-- If your send_queue exists, also denormalize sender_account_id for quick access
alter table if exists public.send_queue
  add column if not exists sender_account_id uuid references public.sender_accounts(id);

create index if not exists send_queue_sender_idx on public.send_queue (sender_account_id);


