-- Block 8400 — SmartSend Campaign Stats Engine (Real-Time Metrics + Daily Summaries + Lead-Level Insights)
-- This migration creates the stats tracking system for campaign analytics

-- 1. Create smartsend_campaign_stats table
create table if not exists public.smartsend_campaign_stats (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  date date not null,
  emails_sent int default 0,
  replies int default 0,
  failures int default 0,
  created_at timestamptz default now(),
  unique(campaign_id, date)
);

-- Create indexes for efficient querying
create index if not exists idx_smartsend_campaign_stats_campaign_date 
  on public.smartsend_campaign_stats (campaign_id, date desc);

create index if not exists idx_smartsend_campaign_stats_date 
  on public.smartsend_campaign_stats (date desc);

-- 2. Add aggregate fields to campaigns table
alter table public.campaigns
  add column if not exists total_sent int default 0;

alter table public.campaigns
  add column if not exists total_replies int default 0;

alter table public.campaigns
  add column if not exists total_failures int default 0;

-- 3. Create RPC function to increment stats
create or replace function public.smartsend_increment_stat(
  p_campaign_id uuid,
  p_date date,
  p_field text
)
returns void
language plpgsql
security definer
as $$
begin
  -- Insert row if it doesn't exist (upsert pattern)
  insert into public.smartsend_campaign_stats(campaign_id, date, emails_sent, replies, failures)
  values (p_campaign_id, p_date, 0, 0, 0)
  on conflict (campaign_id, date) do nothing;

  -- Increment the appropriate field
  if p_field = 'emails_sent' then
    update public.smartsend_campaign_stats
    set emails_sent = emails_sent + 1
    where campaign_id = p_campaign_id
    and date = p_date;

    -- Also update campaign aggregate
    update public.campaigns
    set total_sent = total_sent + 1
    where id = p_campaign_id;

  elsif p_field = 'replies' then
    update public.smartsend_campaign_stats
    set replies = replies + 1
    where campaign_id = p_campaign_id
    and date = p_date;

    -- Also update campaign aggregate
    update public.campaigns
    set total_replies = total_replies + 1
    where id = p_campaign_id;

  elsif p_field = 'failures' then
    update public.smartsend_campaign_stats
    set failures = failures + 1
    where campaign_id = p_campaign_id
    and date = p_date;

    -- Also update campaign aggregate
    update public.campaigns
    set total_failures = total_failures + 1
    where id = p_campaign_id;

  end if;
end;
$$;

-- Grant execute permission
grant execute on function public.smartsend_increment_stat(uuid, date, text) to service_role, authenticated;

-- Enable RLS on smartsend_campaign_stats
alter table public.smartsend_campaign_stats enable row level security;

-- RLS policy: Users can view stats for their campaigns
create policy "smartsend_campaign_stats_select_own"
  on public.smartsend_campaign_stats
  for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = smartsend_campaign_stats.campaign_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

-- Service role can insert/update (for edge functions)
create policy "smartsend_campaign_stats_service_role"
  on public.smartsend_campaign_stats
  for all
  using (true)
  with check (true);


