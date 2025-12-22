-- Block 116 — Provider Error Classifier
-- Normalizes 4xx/5xx/429/bounce errors → actions
-- Idempotent migration

-- A) Types

do $$ begin
  if not exists (select 1 from pg_type where typname = 'error_kind') then
    create type error_kind as enum (
      'rate_limit','server_error','auth_error','quota_exceeded',
      'invalid_recipient','spam_block','policy_violation',
      'temporary_deferral','network','unknown'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'error_action') then
    create type error_action as enum ('retry','dead_letter','suppress_recipient','pause_account','escalate');
  end if;
exception when duplicate_object then null; end $$;

-- B) Catalog of provider-specific patterns (regex on code and/or message)

create table if not exists public.provider_error_catalog (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('gmail','outlook')),
  code_pattern text,          -- e.g. '^429$' or '5\\d\\d'
  message_pattern text,       -- lowercase regex matched against normalized message
  kind error_kind not null,
  action error_action not null,
  permanent boolean not null default false,
  priority int not null default 100, -- lower number = higher priority
  notes text,
  created_at timestamptz not null default now(),
  unique(provider, coalesce(code_pattern,''), coalesce(message_pattern,''), kind, action)
);

create index if not exists idx_provider_error_catalog_provider on public.provider_error_catalog(provider, priority);

-- C) Seed common rules (safe upserts)

insert into public.provider_error_catalog (provider, code_pattern, message_pattern, kind, action, permanent, priority, notes)
values
-- Rate limits / deferrals
('gmail','^429$','rate limit|too many|user-rate|quota exceeded', 'rate_limit','retry', false, 10,'Gmail 429 throttle'),
('outlook','^429$','rate limit|too many|throttle', 'rate_limit','retry', false, 10,'Outlook 429 throttle'),
('gmail',null,'try again later|temporarily unavailable|deferred', 'temporary_deferral','retry', false, 20,'Temp deferral'),
('outlook',null,'mailbox busy|server busy|try again later', 'temporary_deferral','retry', false, 20,'Temp deferral'),

-- Server errors
('gmail','^5\\d\\d$',null,'server_error','retry', false, 30,'5xx generic'),
('outlook','^5\\d\\d$',null,'server_error','retry', false, 30,'5xx generic'),

-- Auth / policy
('gmail',null,'auth|unauthorized|invalid credentials|not permitted', 'auth_error','pause_account', true, 5,'Auth broken'),
('outlook',null,'auth|unauthorized|invalid client|not permitted', 'auth_error','pause_account', true, 5,'Auth broken'),
('gmail',null,'policy|blocked by gmail|app not verified', 'policy_violation','escalate', true, 15,'Policy issues'),
('outlook',null,'policy|blocked|tenant policy', 'policy_violation','escalate', true, 15,'Policy issues'),

-- Bounces / invalid
('gmail',null,'550|554|user unknown|mailbox unavailable|no such user|invalid address', 'invalid_recipient','suppress_recipient', true, 1,'Hard bounce'),
('outlook',null,'550|554|user unknown|mailbox unavailable|invalid recipient', 'invalid_recipient','suppress_recipient', true, 1,'Hard bounce'),

-- Spam blocks
('gmail',null,'spam|blocked by spam|content rejected', 'spam_block','dead_letter', true, 40,'Spam content'),
('outlook',null,'spam|junk|content filtered', 'spam_block','dead_letter', true, 40,'Spam content')
on conflict do nothing;

-- D) Unknown samples table for learning loop

create table if not exists public.unknown_error_samples (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text not null check (provider in ('gmail','outlook')),
  raw_code text,
  raw_message text,
  account_id uuid references public.accounts(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  queue_id uuid references public.send_queue(id) on delete set null,
  handled boolean not null default false
);

create index if not exists idx_unknown_error_samples_provider on public.unknown_error_samples(provider, handled, created_at desc);
create index if not exists idx_unknown_error_samples_queue on public.unknown_error_samples(queue_id) where queue_id is not null;

-- E) Classifier function: returns the best matching rule or unknown

create or replace function public.classify_provider_error(
  p_provider text, p_code text, p_message text
) returns table(kind error_kind, action error_action, permanent boolean)
language plpgsql
stable
as $$
declare
  v_msg text := lower(coalesce(p_message,''));
  v_code text := coalesce(p_code,'');
begin
  return query
  select c.kind, c.action, c.permanent
  from public.provider_error_catalog c
  where c.provider = p_provider
    and (c.code_pattern is null or v_code ~ c.code_pattern)
    and (c.message_pattern is null or v_msg ~ c.message_pattern)
  order by c.priority asc
  limit 1;

  if not found then
    return query select 'unknown'::error_kind, 'retry'::error_action, false;
  end if;
end $$;

-- F) Schema tweaks: pause flag on accounts (if not present)

alter table if exists public.accounts
  add column if not exists sending_paused boolean not null default false,
  add column if not exists paused_reason text;

create index if not exists idx_accounts_sending_paused on public.accounts(sending_paused) where sending_paused = true;














