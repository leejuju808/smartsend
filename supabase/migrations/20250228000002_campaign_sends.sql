-- Campaign Send Queue Table
-- Creates campaign_sends table for queuing and tracking email sends

create table if not exists campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text check (status in ('pending','sending','sent','failed','retrying')) default 'pending',
  fail_count int default 0,
  last_error text,
  message_id text,
  created_at timestamptz default now()
);

create index if not exists idx_campaign_sends_status on campaign_sends(status, scheduled_at);
create index if not exists idx_campaign_sends_campaign on campaign_sends(campaign_id);
create index if not exists idx_campaign_sends_lead on campaign_sends(lead_id);

alter table campaign_sends enable row level security;

create policy "user can view own send queue"
on campaign_sends for select
to authenticated
using (
  exists (
    select 1 from campaigns c
    where c.id = campaign_sends.campaign_id
    and c.user_id = auth.uid()
  )
);

-- Service role can insert/update for worker
create policy "service role can manage send queue"
on campaign_sends for all
to service_role
using (true)
with check (true);

