-- Email tracking events migration
-- Adds open_events, click_events, and campaign metrics
-- Adds message_uuid and step_number to send_queue for attribution

-- 1. Add tracking columns to send_queue
alter table public.send_queue
  add column if not exists message_uuid uuid default gen_random_uuid(),
  add column if not exists step_number int;

create index if not exists idx_send_queue_message_uuid on public.send_queue(message_uuid);

-- 2. Create open_events table
create table if not exists public.open_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  lead_id uuid not null references leads(id) on delete cascade,
  message_uuid uuid,
  ip inet,
  ua text,
  created_at timestamptz default now()
);

create index if not exists idx_open_events_campaign on public.open_events(campaign_id, created_at desc);
create index if not exists idx_open_events_lead on public.open_events(lead_id, created_at desc);
create index if not exists idx_open_events_message_uuid on public.open_events(message_uuid);

-- 3. Create click_events table
create table if not exists public.click_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  lead_id uuid not null references leads(id) on delete cascade,
  message_uuid uuid,
  url text not null,
  ip inet,
  ua text,
  created_at timestamptz default now()
);

create index if not exists idx_click_events_campaign on public.click_events(campaign_id, created_at desc);
create index if not exists idx_click_events_lead on public.click_events(lead_id, created_at desc);
create index if not exists idx_click_events_message_uuid on public.click_events(message_uuid);

-- 4. Add suppression flags to leads
alter table public.leads
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists bounced_at timestamptz;

-- 5. Create campaign metrics view
create or replace view public.campaign_metrics as
select
  c.id as campaign_id,
  count(sq.id) filter (where sq.state='sent') as emails_sent,
  count(oe.id) as opens,
  count(distinct oe.lead_id) as leads_opened,
  count(ce.id) as clicks,
  count(distinct ce.lead_id) as leads_clicked,
  case 
    when count(sq.id) filter (where sq.state='sent') > 0 
    then round(100.0 * count(distinct oe.lead_id) / count(sq.id) filter (where sq.state='sent'), 2)
    else 0 
  end as open_rate,
  case 
    when count(sq.id) filter (where sq.state='sent') > 0 
    then round(100.0 * count(distinct ce.lead_id) / count(sq.id) filter (where sq.state='sent'), 2)
    else 0 
  end as click_rate
from campaigns c
left join send_queue sq on sq.campaign_id = c.id
left join open_events oe on oe.campaign_id = c.id
left join click_events ce on ce.campaign_id = c.id
group by c.id;

-- 6. Enable RLS on tracking tables
alter table public.open_events enable row level security;
alter table public.click_events enable row level security;

-- RLS policy for open_events: org members can read
create policy "org can read open_events" on public.open_events
  for select using (exists (
    select 1 from org_members om 
    where om.org_id = open_events.org_id 
    and om.user_id = auth.uid()
  ));

-- Service role can insert open_events
create policy "service can insert open_events" on public.open_events
  for insert to service_role with check (true);

-- RLS policy for click_events: org members can read
create policy "org can read click_events" on public.click_events
  for select using (exists (
    select 1 from org_members om 
    where om.org_id = click_events.org_id 
    and om.user_id = auth.uid()
  ));

-- Service role can insert click_events
create policy "service can insert click_events" on public.click_events
  for insert to service_role with check (true);

-- Grant access to the metrics view
grant select on public.campaign_metrics to authenticated;

