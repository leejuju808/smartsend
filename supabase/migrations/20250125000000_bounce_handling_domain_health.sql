-- Bounce Handling + Domain Health Migration
-- Extends email_logs with bounce tracking, creates email_bounces table,
-- adds domain health views, and implements RLS

-- Extend email_logs table with bounce fields
alter table public.email_logs
  add column if not exists bounced_at timestamptz,
  add column if not exists bounce_type text check (bounce_type in ('hard','soft')),
  add column if not exists bounce_reason text,
  add column if not exists delivery_status text check (delivery_status in ('sent','bounced','queued','failed'));

-- Bounce records table
create table if not exists public.email_bounces (
  id uuid primary key default gen_random_uuid(),
  email_log_id uuid references public.email_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  to_email text not null,
  type text not null check (type in ('hard','soft')),
  status_code text,     -- e.g. 5.1.1
  diagnostic text,      -- SMTP / DSN reason
  provider text,        -- gmail | outlook | smtp
  created_at timestamptz not null default now()
);

create index if not exists idx_email_bounces_user_email on public.email_bounces(user_id, to_email);
create index if not exists idx_email_bounces_log on public.email_bounces(email_log_id);
create index if not exists idx_email_bounces_type on public.email_bounces(type);

alter table public.email_bounces enable row level security;

create policy if not exists "bounces_select_own" on public.email_bounces 
  for select using (auth.uid() = user_id);

-- Domain health views (7d & 30d rolling)
create or replace view public.domain_health_30d as
with base as (
  select
    user_id,
    split_part(to_email,'@',2) as domain,
    (bounced_at is not null)::int as is_bounced,
    (bounce_type = 'hard')::int as is_hard,
    (status = 'bounced')::int as is_unsub, -- Using status as proxy for unsub
    created_at
  from public.email_logs
  where created_at >= now() - interval '30 days'
)
select
  user_id,
  domain,
  count(*)::int as sent_30d,
  sum(is_bounced)::int as bounces_30d,
  sum(is_hard)::int as hard_bounces_30d,
  sum(is_unsub)::int as unsubs_30d,
  round(100.0 * sum(is_bounced) / nullif(count(*),0), 2) as bounce_rate_30d,
  round(100.0 * sum(is_unsub) / nullif(count(*),0), 2) as unsub_rate_30d
from base
group by user_id, domain
order by bounce_rate_30d desc nulls last;

create or replace view public.domain_health_7d as
with base as (
  select
    user_id,
    split_part(to_email,'@',2) as domain,
    (bounced_at is not null)::int as is_bounced,
    (bounce_type = 'hard')::int as is_hard,
    (status = 'bounced')::int as is_unsub,
    created_at
  from public.email_logs
  where created_at >= now() - interval '7 days'
)
select
  user_id,
  domain,
  count(*)::int as sent_7d,
  sum(is_bounced)::int as bounces_7d,
  sum(is_hard)::int as hard_bounces_7d,
  sum(is_unsub)::int as unsubs_7d,
  round(100.0 * sum(is_bounced) / nullif(count(*),0), 2) as bounce_rate_7d,
  round(100.0 * sum(is_unsub) / nullif(count(*),0), 2) as unsub_rate_7d
from base
group by user_id, domain
order by bounce_rate_7d desc nulls last;

-- Grant access to views
grant select on public.domain_health_30d to authenticated;
grant select on public.domain_health_7d to authenticated; 