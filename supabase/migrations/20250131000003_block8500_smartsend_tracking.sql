-- Block 8500 — SmartSend Open Tracking Pixel + Click Tracking
-- This migration creates the tracking system for email opens and clicks

-- 1. Base table for both open + click tokens
create table if not exists public.smartsend_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  url text not null, -- 'open' for pixel, or actual URL for clicks
  token text not null unique,
  type text not null check (type in ('open', 'click')),
  created_at timestamptz default now()
);

create index if not exists smartsend_links_token_idx on public.smartsend_links (token);
create index if not exists smartsend_links_campaign_lead_idx on public.smartsend_links (campaign_id, lead_id);

-- 2. Open events table
create table if not exists public.smartsend_open_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.smartsend_links(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  opened_at timestamptz default now()
);

create index if not exists smartsend_open_events_campaign_lead_idx
  on public.smartsend_open_events (campaign_id, lead_id);
create index if not exists smartsend_open_events_link_idx
  on public.smartsend_open_events (link_id);

-- 3. Click events table
create table if not exists public.smartsend_click_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.smartsend_links(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  clicked_at timestamptz default now()
);

create index if not exists smartsend_click_events_campaign_lead_idx
  on public.smartsend_click_events (campaign_id, lead_id);
create index if not exists smartsend_click_events_link_idx
  on public.smartsend_click_events (link_id);

-- 4. Extend stats table for opens & clicks
alter table public.smartsend_campaign_stats
  add column if not exists opens int default 0,
  add column if not exists clicks int default 0;

-- 5. Extend campaigns aggregates
alter table public.campaigns
  add column if not exists total_opens int default 0,
  add column if not exists total_clicks int default 0;

-- 6. Update RPC function to handle opens & clicks
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
  insert into public.smartsend_campaign_stats(
    campaign_id, date, emails_sent, replies, failures, opens, clicks
  )
  values (p_campaign_id, p_date, 0, 0, 0, 0, 0)
  on conflict (campaign_id, date) do nothing;

  -- Increment the appropriate field
  if p_field = 'emails_sent' then
    update public.smartsend_campaign_stats
    set emails_sent = emails_sent + 1
    where campaign_id = p_campaign_id and date = p_date;

    update public.campaigns
    set total_sent = coalesce(total_sent, 0) + 1
    where id = p_campaign_id;

  elsif p_field = 'replies' then
    update public.smartsend_campaign_stats
    set replies = replies + 1
    where campaign_id = p_campaign_id and date = p_date;

    update public.campaigns
    set total_replies = coalesce(total_replies, 0) + 1
    where id = p_campaign_id;

  elsif p_field = 'failures' then
    update public.smartsend_campaign_stats
    set failures = failures + 1
    where campaign_id = p_campaign_id and date = p_date;

    update public.campaigns
    set total_failures = coalesce(total_failures, 0) + 1
    where id = p_campaign_id;

  elsif p_field = 'opens' then
    update public.smartsend_campaign_stats
    set opens = opens + 1
    where campaign_id = p_campaign_id and date = p_date;

    update public.campaigns
    set total_opens = coalesce(total_opens, 0) + 1
    where id = p_campaign_id;

  elsif p_field = 'clicks' then
    update public.smartsend_campaign_stats
    set clicks = clicks + 1
    where campaign_id = p_campaign_id and date = p_date;

    update public.campaigns
    set total_clicks = coalesce(total_clicks, 0) + 1
    where id = p_campaign_id;

  end if;
end;
$$;

-- Enable RLS on tracking tables
alter table public.smartsend_links enable row level security;
alter table public.smartsend_open_events enable row level security;
alter table public.smartsend_click_events enable row level security;

-- RLS policy: Users can view links for their campaigns
create policy "smartsend_links_select_own"
  on public.smartsend_links
  for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = smartsend_links.campaign_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

-- Service role can insert/update (for edge functions and API routes)
create policy "smartsend_links_service_role"
  on public.smartsend_links
  for all
  using (true)
  with check (true);

-- RLS policy: Users can view open events for their campaigns
create policy "smartsend_open_events_select_own"
  on public.smartsend_open_events
  for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = smartsend_open_events.campaign_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

-- Service role can insert/update
create policy "smartsend_open_events_service_role"
  on public.smartsend_open_events
  for all
  using (true)
  with check (true);

-- RLS policy: Users can view click events for their campaigns
create policy "smartsend_click_events_select_own"
  on public.smartsend_click_events
  for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = smartsend_click_events.campaign_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

-- Service role can insert/update
create policy "smartsend_click_events_service_role"
  on public.smartsend_click_events
  for all
  using (true)
  with check (true);

