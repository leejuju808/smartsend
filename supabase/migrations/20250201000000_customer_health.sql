-- Customer Health Tracking System
-- Tracks user engagement, login activity, and automated check-ins

create table if not exists public.customer_health (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.orgs(id) on delete cascade,
  last_login timestamptz,
  emails_sent int default 0,
  replies_received int default 0,
  ai_score numeric, -- 0-100 engagement health score
  last_check_in timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- Indexes
create index if not exists idx_customer_health_user on public.customer_health(user_id);
create index if not exists idx_customer_health_org on public.customer_health(org_id);
create index if not exists idx_customer_health_score on public.customer_health(ai_score);
create index if not exists idx_customer_health_login on public.customer_health(last_login);

-- RLS policies
alter table public.customer_health enable row level security;

create policy "users_select_own_health" on public.customer_health
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "service_role_manage_health" on public.customer_health
  for all
  to service_role
  using (true)
  with check (true);

-- Function to update customer health scores
create or replace function public.update_customer_health()
returns void
language sql
security definer
as $$
  update public.customer_health
  set
    ai_score = least(100,
      greatest(0,
        (coalesce(emails_sent, 0) * 0.4)
        + (coalesce(replies_received, 0) * 0.6)
        - extract(day from (now() - coalesce(last_login, created_at))) * 2
      )
    ),
    last_check_in = now(),
    updated_at = now();
$$;

-- Function to initialize health record for new user
create or replace function public.init_customer_health(new_user_id uuid, new_org_id uuid)
returns void
language sql
security definer
as $$
  insert into public.customer_health (user_id, org_id, last_login, ai_score)
  values (new_user_id, new_org_id, now(), 50)
  on conflict (user_id) do nothing;
$$;

-- Function to update login time
create or replace function public.track_user_login(user_id uuid)
returns void
language sql
security definer
as $$
  insert into public.customer_health (user_id, last_login, ai_score)
  values (user_id, now(), coalesce((select ai_score from public.customer_health where customer_health.user_id = track_user_login.user_id), 50))
  on conflict (user_id)
  do update set last_login = now(), updated_at = now();
$$;

-- View for engagement overview
create or replace view public.engagement_overview as
select 
  round(avg(ai_score), 1) as avg_score,
  count(*) filter (where ai_score < 40) as at_risk_users,
  count(*) filter (where ai_score >= 75) as healthy_users,
  count(*) as total_users,
  round(avg(emails_sent), 1) as avg_emails_sent,
  round(avg(replies_received), 1) as avg_replies_received
from public.customer_health;

-- Grant permissions
grant select on public.engagement_overview to authenticated;

-- Function to aggregate health data from actual email activity
create or replace function public.refresh_customer_health_metrics()
returns void
language plpgsql
security definer
as $$
begin
  -- Update health records from existing data sources
  update public.customer_health ch
  set
    emails_sent = coalesce((
      select count(*) 
      from public.email_logs el 
      where el.user_id = ch.user_id 
        and el.status = 'sent'
        and el.sent_at > now() - interval '30 days'
    ), 0),
    replies_received = coalesce((
      select count(*)
      from public.email_logs el
      where el.user_id = ch.user_id
        and el.replied_at is not null
        and el.replied_at > now() - interval '30 days'
    ), 0),
    updated_at = now();
  
  -- Recalculate scores after updating metrics
  perform public.update_customer_health();
end;
$$;

comment on table public.customer_health is 'Tracks customer engagement and health scores for retention';
comment on function public.update_customer_health() is 'Nightly job to recalculate all health scores';
comment on function public.init_customer_health(uuid, uuid) is 'Initialize health record for new users';
comment on function public.track_user_login(uuid) is 'Update last login timestamp';

