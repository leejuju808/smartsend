-- Preflight System: Email validation before sending
-- Idempotent migration for preflight checks, warmup profiles, domain health, and rules

-- A) Status + reasons ------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'preflight_decision') then
    create type preflight_decision as enum ('allow','hold','block');
  end if;
exception when duplicate_object then null; end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'preflight_reason') then
    create type preflight_reason as enum (
      'ok','too_many_links','short_url_detected','spam_phrase','all_caps_subject',
      'no_unsubscribe','domain_blocklisted','domain_unhealthy','warmup_gate',
      'no_text_part','too_long','too_short','missing_from'
    );
  end if;
exception when duplicate_object then null; end $$;

-- Add preflight columns to send_queue
alter table if exists public.send_queue
  add column if not exists preflight_decision preflight_decision,
  add column if not exists preflight_score int,
  add column if not exists preflight_reasons text[],
  add column if not exists held_at timestamptz,
  add column if not exists released_at timestamptz;

-- Add "held_preflight" status to send_queue status check
-- First, check if status column exists and has a check constraint
do $$
declare
  constraint_name text;
begin
  -- Try to find existing status check constraint
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.send_queue'::regclass
    and contype = 'c'
    and conname like '%status%';
  
  if constraint_name is not null then
    -- Drop existing constraint if it exists
    execute format('alter table public.send_queue drop constraint if exists %I', constraint_name);
  end if;
end $$;

-- Add held_preflight to status enum/check if needed
-- Note: If status is a text column with check constraint, we'll handle it dynamically
do $$
begin
  -- Check if status column allows 'held_preflight'
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'send_queue' 
      and column_name = 'status'
  ) then
    -- Try to add held_preflight to the constraint
    -- This will fail gracefully if the constraint doesn't exist or already includes it
    begin
      alter table public.send_queue
        drop constraint if exists send_queue_status_check;
      
      -- Recreate with held_preflight included
      alter table public.send_queue
        add constraint send_queue_status_check
        check (status in ('pending','sending','sent','failed','retry_scheduled','dead_letter','held_preflight','queued','picked','canceled','error','paused'));
    exception when others then
      -- If constraint recreation fails, try to just ensure the column accepts the value
      null;
    end;
  end if;
end $$;

-- B) Warmup profiles per account ------------------------------------------------

create table if not exists public.account_warmup_profiles (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  enabled boolean not null default true,
  min_account_age_days int not null default 7,
  daily_ramp_start int not null default 30,      -- first-day cap
  daily_ramp_increment int not null default 30,  -- per-day increase
  daily_ramp_cap int not null default 300,       -- max allowed by policy
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_account_warmup_profiles_updated_at on public.account_warmup_profiles;
create trigger trg_account_warmup_profiles_updated_at
before update on public.account_warmup_profiles
for each row
execute function public.set_updated_at();

-- C) Domain health cache (maintained by separate cron/fn you'll add later) ------

create table if not exists public.domain_health (
  domain text primary key,
  last_checked_at timestamptz not null default now(),
  spf_ok boolean, 
  dkim_ok boolean, 
  dmarc_ok boolean,
  reputation text check (reputation in ('good','warn','bad')) default 'good',
  blocklisted boolean not null default false,
  notes text
);

create index if not exists idx_domain_health_reputation on public.domain_health(reputation, blocklisted);

-- D) Block/allow lists & phrases -----------------------------------------------

create table if not exists public.preflight_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  kind text not null check (kind in ('allow_domain','block_domain','spam_phrase','allow_link_domain','block_link_domain')),
  value text not null,
  created_at timestamptz not null default now(),
  unique(account_id, kind, value)
);

create index if not exists idx_preflight_rules_account_kind on public.preflight_rules(account_id, kind);

-- E) Results log ----------------------------------------------------------------

create table if not exists public.preflight_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  queue_id uuid not null references public.send_queue(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  decision preflight_decision not null,
  score int not null,
  reasons text[] not null,
  details jsonb not null default '{}'::jsonb
);

create index if not exists idx_preflight_results_queue on public.preflight_results(queue_id);
create index if not exists idx_preflight_results_account on public.preflight_results(account_id, created_at desc);
create index if not exists idx_preflight_results_decision on public.preflight_results(decision, created_at desc);

