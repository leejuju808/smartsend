-- Step 1 — DB: sender health + risk score stamping
-- Per-sender mailbox health (rolling metrics)

create table if not exists public.sender_health (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null,
  mailbox_email text not null,                         -- the From address
  day date not null default (now() at time zone 'utc')::date,
  sends int not null default 0,
  bounces int not null default 0,
  complaints int not null default 0,                   -- list-unsub/abuse webhooks if available
  unsubscribes int not null default 0,
  opens int not null default 0,
  replies int not null default 0,
  health_score numeric,                                -- 0..1 (computed nightly)
  unique(account_id, mailbox_email, day)
);

create index if not exists ix_sender_health_mailbox on public.sender_health(mailbox_email, day);
create index if not exists ix_sender_health_account_day on public.sender_health(account_id, day desc);

-- Risk stamp per scheduled message
-- Note: If scheduled_messages doesn't exist, create it; otherwise alter it
create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  contact_id uuid,
  subject text,
  body text,
  scheduled_at timestamptz,
  status text default 'pending'
);

alter table public.scheduled_messages
  add column if not exists spam_risk numeric,          -- 0..1 (1 = very risky)
  add column if not exists throttle_reason text,       -- null | 'domain_hot' | 'content_risky' | ...
  add column if not exists throttled boolean default false;

-- Also add to send_queue if that's the primary table
alter table public.send_queue
  add column if not exists spam_risk numeric,
  add column if not exists throttle_reason text,
  add column if not exists throttled boolean default false;

-- Campaign-level throttle knobs
alter table public.campaigns
  add column if not exists max_daily_sends_per_mailbox int default 200,
  add column if not exists bounce_halt_threshold numeric default 0.05,      -- 5% day bounce
  add column if not exists complaint_halt_threshold numeric default 0.002,  -- 0.2% day complaints
  add column if not exists risk_block_threshold numeric default 0.75,       -- block if risk >= 0.75
  add column if not exists risk_warn_threshold numeric default 0.55;        -- warn if >= 0.55

-- RLS for sender_health
alter table public.sender_health enable row level security;

create policy "sender_health_select_own" on public.sender_health
  for select using (account_id = auth.uid() or account_id in (
    select id from public.campaigns where user_id = auth.uid() or account_id = auth.uid()
  ));

-- Updated_at trigger for sender_health
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sender_health_updated_at on public.sender_health;
create trigger trg_sender_health_updated_at
before update on public.sender_health
for each row execute function public.set_updated_at();















