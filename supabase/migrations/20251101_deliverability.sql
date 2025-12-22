-- Block 18: Deliverability Engine - Core Tables and Views
-- SmartSend — Block 18: Deliverability Engine (warm‑up, Throttling, Bounces, Hygiene)

-- 1) Domain sending rules (throttling per domain)
create table if not exists public.domain_sending_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  domain text not null,                    -- e.g., 'gmail.com', 'acme.com'
  daily_cap int not null default 50,       -- max emails per day to this domain
  hourly_cap int not null default 10,      -- max emails per hour
  min_gap_seconds int not null default 60, -- min seconds between sends to this domain
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, domain)
);

create index if not exists idx_domain_rules_workspace on public.domain_sending_rules(workspace_id);
create index if not exists idx_domain_rules_domain on public.domain_sending_rules(domain);

-- 2) Warm-up state (per sending account)
create table if not exists public.warmup_state (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  account_email text not null,            -- sending email address
  day_index int not null default 1,       -- warm-up day (1, 2, 3, ...)
  daily_cap int not null default 20,       -- current day's cap
  sent_today int not null default 0,       -- emails sent today
  paused boolean not null default false,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, account_email)
);

create index if not exists idx_warmup_workspace on public.warmup_state(workspace_id);
create index if not exists idx_warmup_account on public.warmup_state(account_email);

-- 3) Bounce events (NDR/DSN tracking)
create table if not exists public.bounce_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  recipient_email text not null,
  bounce_type text not null check (bounce_type in ('hard','soft','transient','complaint')),
  bounce_code text,                        -- SMTP code or provider code
  bounce_reason text,                      -- human-readable reason
  raw_message text,                        -- full NDR body for analysis
  original_message_id text,                -- reference to original send
  processed boolean not null default false,
  suppressed_at timestamptz,              -- when we added to suppression
  created_at timestamptz not null default now()
);

create index if not exists idx_bounce_workspace on public.bounce_events(workspace_id);
create index if not exists idx_bounce_recipient on public.bounce_events(recipient_email);
create index if not exists idx_bounce_processed on public.bounce_events(processed);
create index if not exists idx_bounce_type on public.bounce_events(bounce_type);

-- 4) Suppression list (extends existing if present)
do $$ begin
  if not exists (select 1 from information_schema.tables 
    where table_schema='public' and table_name='suppression_list') then
    create table public.suppression_list (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null,
      email text not null,
      reason text not null check (reason in ('unsubscribed','bounced','complaint','manual','role_account','invalid_format')),
      source text,                         -- 'bounce_classifier', 'manual', 'import', etc.
      metadata jsonb default '{}'::jsonb,
      created_at timestamptz not null default now(),
      unique(workspace_id, lower(email))
    );
  end if;
end $$;

-- Add reason column if missing
do $$ begin
  if not exists (select 1 from information_schema.columns 
    where table_schema='public' and table_name='suppression_list' and column_name='reason') then
    alter table public.suppression_list add column reason text;
    update public.suppression_list set reason = 'manual' where reason is null;
    alter table public.suppression_list alter column reason set not null;
  end if;
end $$;

create index if not exists idx_suppression_workspace on public.suppression_list(workspace_id);
create index if not exists idx_suppression_email on public.suppression_list(lower(email));
create index if not exists idx_suppression_reason on public.suppression_list(reason);

-- 5) Deliverability reputation (rolling metrics)
create table if not exists public.deliverability_reputation (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  account_email text not null,
  date date not null,                     -- daily snapshot
  sent_count int not null default 0,
  bounce_count int not null default 0,
  complaint_count int not null default 0,
  open_count int not null default 0,
  click_count int not null default 0,
  reputation_score numeric(5,2) not null default 100.0, -- 0-100 score
  created_at timestamptz not null default now(),
  unique(workspace_id, account_email, date)
);

create index if not exists idx_rep_workspace on public.deliverability_reputation(workspace_id);
create index if not exists idx_rep_account_date on public.deliverability_reputation(account_email, date desc);

-- 6) Overview view (7-day metrics)
create or replace view public.view_deliverability_overview as
select
  w.id as workspace_id,
  count(distinct e.id) filter (where e.created_at >= now() - interval '7 days' and e.status = 'sent') as sent_7d,
  coalesce(
    avg(case when e.created_at >= now() - interval '7 days' then e.open_rate else null end),
    0.0
  ) as open_rate,
  coalesce(
    avg(r.reputation_score) filter (where r.date >= current_date - interval '7 days'),
    100.0
  ) as rep_score
from public.workspaces w
left join public.send_queue e on e.workspace_id = w.id
left join public.deliverability_reputation r on r.workspace_id = w.id
group by w.id;

alter view public.view_deliverability_overview set (security_invoker = on);

-- 7) RLS Policies
alter table public.domain_sending_rules enable row level security;
alter table public.warmup_state enable row level security;
alter table public.bounce_events enable row level security;
alter table public.deliverability_reputation enable row level security;

-- Domain rules policies
create policy "domain_rules_select" on public.domain_sending_rules
  for select to authenticated
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "domain_rules_insert" on public.domain_sending_rules
  for insert to authenticated
  with check (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "domain_rules_update" on public.domain_sending_rules
  for update to authenticated
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- Warmup state policies
create policy "warmup_select" on public.warmup_state
  for select to authenticated
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "warmup_insert" on public.warmup_state
  for insert to authenticated
  with check (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "warmup_update" on public.warmup_state
  for update to authenticated
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- Bounce events policies
create policy "bounce_select" on public.bounce_events
  for select to authenticated
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

create policy "bounce_insert" on public.bounce_events
  for insert to authenticated
  with check (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- Reputation policies
create policy "rep_select" on public.deliverability_reputation
  for select to authenticated
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- Service role full access
create policy "service_role_full_domain_rules" on public.domain_sending_rules
  for all to service_role using (true) with check (true);

create policy "service_role_full_warmup" on public.warmup_state
  for all to service_role using (true) with check (true);

create policy "service_role_full_bounce" on public.bounce_events
  for all to service_role using (true) with check (true);

create policy "service_role_full_rep" on public.deliverability_reputation
  for all to service_role using (true) with check (true);

