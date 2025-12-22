-- Send Queue System Migration
-- Source of truth for email sending queue with rate limiting and error handling

-- 1. send_queue table
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  from_inbox_id uuid not null, -- references inboxes(id) on delete cascade
  subject text not null,
  body_html text,
  body_text text,
  scheduled_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','picked','sent','error','paused')),
  last_error text,
  attempt_count int not null default 0,
  priority int not null default 100,
  provider_message_id text,
  sent_at timestamptz,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Performance indexes
create index if not exists idx_send_queue_sched on public.send_queue (scheduled_at);
create index if not exists idx_send_queue_status on public.send_queue (status);
create index if not exists idx_send_queue_campaign on public.send_queue (campaign_id);
create index if not exists idx_send_queue_from_inbox on public.send_queue (from_inbox_id);
create index if not exists idx_send_queue_next_attempt on public.send_queue (next_attempt_at) where next_attempt_at is not null;

-- 3. Helpful view
create or replace view public.v_queue_ready as
select *
from public.send_queue
where status = 'pending' 
  and scheduled_at <= now()
  and coalesce(next_attempt_at, now()) <= now()
order by priority asc, scheduled_at asc;

-- 4. Add is_paused column to campaigns if it doesn't exist
alter table public.campaigns 
  add column if not exists is_paused boolean not null default false;

create index if not exists idx_campaigns_is_paused on public.campaigns(is_paused);

-- 5. RLS (typical pattern - adjust team_id lookup based on your schema)
alter table public.send_queue enable row level security;

-- Drop existing policies if they exist
drop policy if exists "team can read their queue" on public.send_queue;
drop policy if exists "team can insert to their queue" on public.send_queue;
drop policy if exists "team can update their queue" on public.send_queue;

-- Policy: Team members can read queue items for campaigns in their team
create policy "team can read their queue"
on public.send_queue for select
using (
  auth.uid() = any (
    select user_id from public.team_members 
    where team_id = (
      select team_id from public.campaigns c 
      where c.id = send_queue.campaign_id
    )
  )
  or exists (
    select 1 from public.campaigns c
    where c.id = send_queue.campaign_id 
    and c.user_id = auth.uid()
  )
);

-- Policy: Team members can insert queue items for campaigns in their team
create policy "team can insert to their queue"
on public.send_queue for insert
with check (
  auth.uid() = any (
    select user_id from public.team_members 
    where team_id = (
      select team_id from public.campaigns c 
      where c.id = campaign_id
    )
  )
  or exists (
    select 1 from public.campaigns c
    where c.id = campaign_id 
    and c.user_id = auth.uid()
  )
);

-- Policy: Team members can update queue items for campaigns in their team
create policy "team can update their queue"
on public.send_queue for update
using (
  auth.uid() = any (
    select user_id from public.team_members 
    where team_id = (
      select team_id from public.campaigns c 
      where c.id = campaign_id
    )
  )
  or exists (
    select 1 from public.campaigns c
    where c.id = campaign_id 
    and c.user_id = auth.uid()
  )
)
with check (
  auth.uid() = any (
    select user_id from public.team_members 
    where team_id = (
      select team_id from public.campaigns c 
      where c.id = campaign_id
    )
  )
  or exists (
    select 1 from public.campaigns c
    where c.id = campaign_id 
    and c.user_id = auth.uid()
  )
);

-- Service role can manage all records
create policy "service role full access"
on public.send_queue
for all
to service_role
using (true)
with check (true);

-- 6. Update trigger for updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_send_queue_updated_at on public.send_queue;
create trigger trg_send_queue_updated_at
before update on public.send_queue
for each row execute function public.set_updated_at();

