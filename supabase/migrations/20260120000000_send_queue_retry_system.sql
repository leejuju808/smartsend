-- Send Queue Retry System
-- Adds retry scheduling, failure categorization, and dead letters

-- 1) send_queue: schedule retries and categorize failures
alter table public.send_queue
  add column if not exists next_attempt_at timestamptz,
  add column if not exists fail_code text,           -- e.g. 'smtp_temp','rate_limit','mailbox_full','auth'
  add column if not exists fail_kind text check (fail_kind in ('transient','permanent')),
  -- attempts already exists; ensure sane default
  alter column attempts set default 0;

-- 2) dead letters for exhausted retries
create table if not exists public.dead_letters (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.send_queue(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.campaign_leads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.dead_letters enable row level security;

create policy "dead_letters read campaign access" on public.dead_letters
for select using (exists (
  select 1 from public.v_campaign_access v
  where v.campaign_id = dead_letters.campaign_id and v.user_id = auth.uid()
));

-- 3) Helpful indexes
create index if not exists idx_sq_next_attempt on public.send_queue(status, next_attempt_at);
create index if not exists idx_sq_campaign_status on public.send_queue(campaign_id, status);

