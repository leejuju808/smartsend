-- SmartSend Core Sending Engine
-- Core entities: mailboxes, campaigns, campaign_targets, send_queue, events, unsubscribes

-- SEND QUEUE (for cron processing)
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  email_lower citext not null,
  name text,
  company text,
  custom_fields jsonb default '{}',
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','bounced','unsubscribed')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  error text,
  sent_at timestamptz,
  scheduled_for timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_send_queue_status_scheduled on public.send_queue(status, scheduled_for);
create index if not exists idx_send_queue_campaign on public.send_queue(campaign_id, status);
create index if not exists idx_send_queue_user on public.send_queue(user_id, status);
create unique index if not exists uniq_send_queue_campaign_email on public.send_queue(campaign_id, email_lower);

alter table public.send_queue enable row level security;
create policy if not exists "send_queue_own" on public.send_queue for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- EMAIL EVENTS (tracking opens, clicks, etc.)
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  email_lower citext not null,
  event_type text not null check (event_type in ('sent','delivered','opened','clicked','bounced','complained','unsubscribed')),
  event_data jsonb default '{}',
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_events_campaign on public.email_events(campaign_id, event_type);
create index if not exists idx_email_events_user on public.email_events(user_id, created_at desc);
create index if not exists idx_email_events_email on public.email_events(email_lower);

alter table public.email_events enable row level security;
create policy if not exists "email_events_own" on public.email_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- UNSUBSCRIBES (one-click unsubscribe tokens)
create table if not exists public.unsubscribes (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  email_lower citext not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  ip_address inet
);

create index if not exists idx_unsubscribes_token on public.unsubscribes(token);
create index if not exists idx_unsubscribes_user on public.unsubscribes(user_id);
create index if not exists idx_unsubscribes_email on public.unsubscribes(email_lower);

alter table public.unsubscribes enable row level security;
create policy if not exists "unsubscribes_own" on public.unsubscribes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- CAMPAIGN TARGETS (for segmenting contacts)
create table if not exists public.campaign_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('all','tags','custom','csv')),
  target_config jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_targets_campaign on public.campaign_targets(campaign_id);
create index if not exists idx_campaign_targets_user on public.campaign_targets(user_id);

alter table public.campaign_targets enable row level security;
create policy if not exists "campaign_targets_own" on public.campaign_targets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Add missing columns to existing campaigns table
alter table public.campaigns add column if not exists mailbox_id uuid references public.mailboxes(owner);
alter table public.campaigns add column if not exists daily_limit int default 100;
alter table public.campaigns add column if not exists delay_minutes int default 0;
alter table public.campaigns add column if not exists reply_tracking boolean default true;
alter table public.campaigns add column if not exists unsubscribe_header boolean default true;

-- Add missing columns to existing mailboxes table
alter table public.mailboxes add column if not exists daily_limit int default 1000;
alter table public.mailboxes add column if not exists hourly_limit int default 100;
alter table public.mailboxes add column if not exists last_sent_at timestamptz;
alter table public.mailboxes add column if not exists daily_sent_count int default 0;
alter table public.mailboxes add column if not exists hourly_sent_count int default 0;

-- Reset daily/hourly counters at midnight/start of hour
create or replace function reset_mailbox_counters()
returns void as $$
begin
  -- Reset daily counters at midnight
  update public.mailboxes 
  set daily_sent_count = 0 
  where date_trunc('day', last_sent_at) < date_trunc('day', now());
  
  -- Reset hourly counters at start of hour
  update public.mailboxes 
  set hourly_sent_count = 0 
  where date_trunc('hour', last_sent_at) < date_trunc('hour', now());
end;
$$ language plpgsql;

-- Function to check if mailbox can send
create or replace function can_mailbox_send(mailbox_owner uuid)
returns boolean as $$
declare
  mailbox_record record;
begin
  select * into mailbox_record from public.mailboxes where owner = mailbox_owner;
  
  if not found or not mailbox_record.verified then
    return false;
  end if;
  
  -- Check daily limit
  if mailbox_record.daily_sent_count >= mailbox_record.daily_limit then
    return false;
  end if;
  
  -- Check hourly limit
  if mailbox_record.hourly_sent_count >= mailbox_record.hourly_limit then
    return false;
  end if;
  
  return true;
end;
$$ language plpgsql;

-- Function to increment mailbox counters
create or replace function increment_mailbox_counters(mailbox_owner uuid)
returns void as $$
begin
  update public.mailboxes 
  set 
    daily_sent_count = daily_sent_count + 1,
    hourly_sent_count = hourly_sent_count + 1,
    last_sent_at = now()
  where owner = mailbox_owner;
end;
$$ language plpgsql;

-- Function to get next batch of emails to send
create or replace function get_next_send_batch(batch_size int default 10)
returns table (
  id uuid,
  campaign_id uuid,
  user_id uuid,
  contact_id uuid,
  email_lower citext,
  name text,
  company text,
  custom_fields jsonb,
  mailbox_id uuid
) as $$
begin
  return query
  select 
    sq.id,
    sq.campaign_id,
    sq.user_id,
    sq.contact_id,
    sq.email_lower,
    sq.name,
    sq.company,
    sq.custom_fields,
    c.mailbox_id
  from public.send_queue sq
  join public.campaigns c on sq.campaign_id = c.id
  where sq.status = 'pending' 
    and sq.scheduled_for <= now()
    and sq.attempts < sq.max_attempts
    and can_mailbox_send(c.mailbox_id)
  order by sq.scheduled_for asc
  limit batch_size;
end;
$$ language plpgsql; 