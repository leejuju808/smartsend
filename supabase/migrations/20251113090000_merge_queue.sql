-- Merge Queue Table
-- Holds "possible duplicate pairs" for manual review

create table if not exists public.merge_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_a uuid references public.leads(id) on delete cascade,
  lead_b uuid references public.leads(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' 
    check (status in ('pending','resolved','ignored'))
);

create index idx_merge_queue_account on public.merge_queue(account_id);
create index idx_merge_queue_status on public.merge_queue(status);
create index idx_merge_queue_created on public.merge_queue(created_at desc);

-- RLS policies
alter table public.merge_queue enable row level security;

create policy merge_queue_select on public.merge_queue
  for select
  using (public.is_account_member(account_id));

create policy merge_queue_modify on public.merge_queue
  for all
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));












