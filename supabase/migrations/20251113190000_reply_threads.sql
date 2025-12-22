-- Block 184: Reply Threads Table
-- Creates reply_threads table for threaded conversation view

create table if not exists public.reply_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  campaign_id uuid references public.campaigns(id),

  last_message_at timestamptz not null default now(),
  ai_category text default 'unclassified' check (ai_category in ('interested', 'not_interested', 'meeting', 'ooo', 'unsubscribe', 'bounce', 'unclear', 'unclassified')),

  assigned_to uuid references auth.users(id),
  status text default 'open' check (status in ('open','snoozed','archived'))
);

-- Indexes
create index if not exists idx_reply_thread_lead on reply_threads(lead_id);
create index if not exists idx_reply_thread_company on reply_threads(company_id);
create index if not exists idx_reply_thread_campaign on reply_threads(campaign_id);
create index if not exists idx_reply_thread_account on reply_threads(account_id);
create index if not exists idx_reply_thread_status on reply_threads(status);
create index if not exists idx_reply_thread_category on reply_threads(ai_category);
create index if not exists idx_reply_thread_last_message on reply_threads(last_message_at desc);

-- Updated_at trigger
create or replace function public.set_reply_thread_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_reply_threads_updated_at on public.reply_threads;
create trigger trg_reply_threads_updated_at
before update on public.reply_threads
for each row execute function public.set_reply_thread_updated_at();

-- RLS
alter table public.reply_threads enable row level security;

-- Policy: Authenticated users can read threads (application-level filtering by account_id)
create policy "reply_threads_read" on public.reply_threads
  for select using (auth.role() = 'authenticated');

-- Policy: Service role can insert/update/delete (for automated events)
create policy "reply_threads_service_role" on public.reply_threads
  for all to service_role
  using (true) with check (true);

-- Comment
comment on table public.reply_threads is 'Threaded conversation view for replies - like Gmail inbox';
comment on column public.reply_threads.ai_category is 'AI-categorized reply type';
comment on column public.reply_threads.status is 'Thread status: open, snoozed, or archived';

