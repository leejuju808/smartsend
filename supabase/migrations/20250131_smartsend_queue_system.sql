-- SmartSend Queue System
-- Sending accounts, queue, tracking, and compliance

-- sending accounts (supports Gmail/Outlook)
create table if not exists sending_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text check (provider in ('gmail','outlook')) not null,
  email_address text not null,
  rate_limit_per_minute int not null default 12,
  daily_cap int not null default 150,
  oauth_access_token text,
  oauth_refresh_token text,
  token_expires_at timestamptz,
  warmup_enabled boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists sending_accounts_user_idx on sending_accounts(user_id);

-- queue of emails to send
create table if not exists smartsend_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid,
  provider_account_id uuid references sending_accounts(id) on delete set null,
  to_email text not null,
  subject text not null,
  body_html text not null,
  schedule_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','paused','cancelled')),
  attempts int not null default 0,
  last_error text,
  message_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists smartsend_queue_status_time on smartsend_queue(status, schedule_at);
create index if not exists smartsend_queue_provider on smartsend_queue(provider_account_id);

-- basic campaign logs
create table if not exists smartsend_campaign_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid,
  lead_id uuid,
  event_type text not null check (event_type in ('email_enqueued','email_sent','send_failed','open','unsubscribe')),
  details jsonb,
  created_at timestamptz default now()
);

create index if not exists smartsend_campaign_logs_campaign on smartsend_campaign_logs(campaign_id);
create index if not exists smartsend_campaign_logs_event_type on smartsend_campaign_logs(event_type, created_at);

-- unsubscribe tokens
create table if not exists unsubscribe_tokens (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null,
  token text unique not null,
  created_at timestamptz default now()
);

create index if not exists unsubscribe_tokens_lead on unsubscribe_tokens(lead_id);
create index if not exists unsubscribe_tokens_token on unsubscribe_tokens(token);

-- opens table
create table if not exists email_opens (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references smartsend_queue(id) on delete cascade,
  opened_at timestamptz default now(),
  ua text,
  ip inet
);

create index if not exists email_opens_queue on email_opens(queue_id);

-- updated_at trigger function
create or replace function trg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

-- apply trigger to smartsend_queue
drop trigger if exists set_updated_at on smartsend_queue;
create trigger set_updated_at before update on smartsend_queue
for each row execute function trg_touch_updated_at();

-- atomically lock and fetch queue items
create or replace function lock_and_fetch_queue(
  p_provider_account_id uuid, 
  p_now timestamptz, 
  p_limit int
)
returns setof smartsend_queue
language plpgsql
as $$
begin
  return query
  with cte as (
    select id from smartsend_queue
    where provider_account_id = p_provider_account_id
      and status = 'queued'
      and schedule_at <= p_now
    order by schedule_at asc
    limit p_limit
    for update skip locked
  )
  update smartsend_queue q
    set status = 'sending'
  from cte
  where q.id = cte.id
  returning q.*;
end$$;

-- RLS
alter table sending_accounts enable row level security;
alter table smartsend_queue enable row level security;
alter table smartsend_campaign_logs enable row level security;
alter table unsubscribe_tokens enable row level security;
alter table email_opens enable row level security;

-- RLS policies
create policy "users manage own sending accounts" on sending_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users view queue items" on smartsend_queue
  for select using (auth.uid() in (select user_id from sending_accounts where id = provider_account_id));

create policy "service role full access" on sending_accounts
  for all to service_role using (true) with check (true);

create policy "service role full access queue" on smartsend_queue
  for all to service_role using (true) with check (true);

create policy "service role full access logs" on smartsend_campaign_logs
  for all to service_role using (true) with check (true);

create policy "service role full access tokens" on unsubscribe_tokens
  for all to service_role using (true) with check (true);

create policy "service role full access opens" on email_opens
  for all to service_role using (true) with check (true);
