-- Mailbox Health Stats and Warmup System
-- Extends existing warmup system with detailed health tracking

-- =====================================================
-- 1. Mailbox Daily Stats Table
-- =====================================================
create table if not exists public.mailbox_daily_stats (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.connected_accounts(id) on delete cascade,
  day date not null,
  sent int not null default 0,
  delivered int not null default 0,
  bounced int not null default 0,
  replied int not null default 0,
  unsubscribed int not null default 0,
  spam_reports int not null default 0,
  opens int not null default 0,
  clicks int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (mailbox_id, day)
);

create index if not exists idx_mds_mailbox_day on public.mailbox_daily_stats(mailbox_id, day);

-- =====================================================
-- 2. Warmup Plans Table (if not exists from previous migration)
-- =====================================================
create table if not exists public.warmup_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- =====================================================
-- 3. Warmup Steps Table (if not exists from previous migration)
-- =====================================================
create table if not exists public.warmup_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.warmup_plans(id) on delete cascade,
  day_no int not null,              -- 1-based day number
  send_cap int not null,            -- max sends allowed for that day
  unique(plan_id, day_no)
);

create index if not exists idx_warmup_steps_plan_day on public.warmup_steps(plan_id, day_no);

-- =====================================================
-- 4. Convenience View: Health Ratios
-- =====================================================
create or replace view public.v_mailbox_health as
select
  s.mailbox_id,
  s.day,
  sent,
  delivered,
  bounced,
  replied,
  unsubscribed,
  spam_reports,
  opens,
  clicks,
  case when sent > 0 then round(100.0 * delivered / sent, 1) else 0 end as deliver_pct,
  case when sent > 0 then round(100.0 * replied   / sent, 1) else 0 end as reply_pct,
  case when sent > 0 then round(100.0 * bounced   / sent, 1) else 0 end as bounce_pct,
  case when delivered > 0 then round(100.0 * opens / delivered, 1) else 0 end as open_rate_pct,
  case when delivered > 0 then round(100.0 * clicks/ delivered, 1) else 0 end as click_rate_pct
from public.mailbox_daily_stats s;

-- =====================================================
-- 5. RLS Policies
-- =====================================================
alter table public.mailbox_daily_stats enable row level security;

-- Owners can view their mailbox stats
create policy "mds.select.owner"
on public.mailbox_daily_stats for select
using (
  exists(
    select 1 from public.connected_accounts m
    where m.id = mailbox_id and m.user_id = auth.uid()
  )
);

-- No client writes; stats updated by server/edge
revoke all on table public.mailbox_daily_stats from anon, authenticated;

-- =====================================================
-- 6. RPC: Atomic Stats Increment Function
-- =====================================================
create or replace function public.incr_mailbox_daily_stats(
  p_id uuid, 
  p_delta jsonb
)
returns void 
language plpgsql 
security definer as $$
begin
  update public.mailbox_daily_stats
     set sent          = sent          + coalesce((p_delta->>'sent')::int, 0),
         delivered     = delivered     + coalesce((p_delta->>'delivered')::int, 0),
         bounced       = bounced       + coalesce((p_delta->>'bounced')::int, 0),
         replied       = replied       + coalesce((p_delta->>'replied')::int, 0),
         unsubscribed  = unsubscribed  + coalesce((p_delta->>'unsubscribed')::int, 0),
         spam_reports  = spam_reports  + coalesce((p_delta->>'spam_reports')::int, 0),
         opens         = opens         + coalesce((p_delta->>'opens')::int, 0),
         clicks        = clicks        + coalesce((p_delta->>'clicks')::int, 0),
         updated_at    = now()
   where id = p_id;
end;
$$;

revoke all on function public.incr_mailbox_daily_stats(uuid,jsonb) from public;
grant execute on function public.incr_mailbox_daily_stats(uuid,jsonb) to service_role;

-- =====================================================
-- 7. Seed Default Warmup Plan (if not exists)
-- =====================================================
insert into public.warmup_plans (name) 
values ('default-30d')
on conflict (name) do nothing;

with p as (
  select id from public.warmup_plans where name='default-30d'
)
insert into public.warmup_steps (plan_id, day_no, send_cap)
select p.id, x.day, x.allowed
from p cross join (values
  (1,10),(2,12),(3,15),(4,18),(5,20),
  (6,22),(7,25),(8,28),(9,30),(10,32),
  (11,35),(12,38),(13,40),(14,42),(15,45),
  (16,48),(17,50),(18,55),(19,60),(20,65),
  (21,70),(22,75),(23,80),(24,85),(25,90),
  (26,95),(27,100),(28,110),(29,120),(30,130)
) as x(day, allowed)
on conflict (plan_id, day_no) do nothing;

-- =====================================================
-- 8. Ensure connected_accounts has warmup columns (safety check)
-- =====================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'connected_accounts' and column_name = 'daily_cap'
  ) then
    alter table public.connected_accounts
      add column daily_cap int default 40,
      add column warmup_enabled boolean default true,
      add column warmup_day int default 1,
      add column warmup_started_at date,
      add column warmup_plan_id uuid references public.warmup_plans(id);
  end if;
  
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'connected_accounts' and column_name = 'warmup_plan_id'
  ) then
    alter table public.connected_accounts
      add column warmup_plan_id uuid references public.warmup_plans(id);
  end if;
end $$;

-- =====================================================
-- 9. Auto-assign default plan to mailboxes without one
-- =====================================================
update public.connected_accounts
set warmup_plan_id = (select id from public.warmup_plans where name = 'default-30d')
where warmup_enabled = true and warmup_plan_id is null;

