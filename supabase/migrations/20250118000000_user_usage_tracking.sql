-- User Usage Tracking System
-- Tracks user activity metrics for upgrade prompts and retention

create table if not exists user_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid,
  metric text not null, -- 'emails_sent', 'campaigns_created', 'replies_received', 'linkedin_dms', 'whatsapp_msgs'
  value int default 0,
  last_updated timestamptz default now(),
  unique(user_id, metric)
);

-- Indexes for fast lookups
create index if not exists idx_user_usage_user_id on user_usage(user_id);
create index if not exists idx_user_usage_metric on user_usage(metric);
create index if not exists idx_user_usage_org_id on user_usage(org_id);

-- RLS policies
alter table user_usage enable row level security;

-- Users can read their own usage
create policy "Users can read own usage" on user_usage
  for select to authenticated
  using (auth.uid() = user_id);

-- Service role can manage all usage (for automated tracking)
create policy "Service role can manage all usage" on user_usage
  for all to service_role
  using (true);

-- Function to increment usage metric
create or replace function increment_usage(p_user_id uuid, p_metric text)
returns void as $$
declare
  v_org_id uuid;
begin
  -- Get org_id from profiles
  select org_id into v_org_id
  from profiles
  where id = p_user_id;
  
  -- Insert or update usage
  insert into user_usage (user_id, org_id, metric, value, last_updated)
  values (p_user_id, v_org_id, p_metric, 1, now())
  on conflict (user_id, metric) do update
  set value = user_usage.value + 1,
      last_updated = now();
end;
$$ language plpgsql security definer;

-- Grant execute to service_role
grant execute on function increment_usage(uuid, text) to service_role;

-- Helper view to get current usage for a user
create or replace view v_user_usage_summary as
select
  user_id,
  org_id,
  sum(value) filter (where metric = 'emails_sent') as emails_sent,
  sum(value) filter (where metric = 'campaigns_created') as campaigns_created,
  sum(value) filter (where metric = 'replies_received') as replies_received,
  sum(value) filter (where metric = 'linkedin_dms') as linkedin_dms,
  sum(value) filter (where metric = 'whatsapp_msgs') as whatsapp_msgs
from user_usage
group by user_id, org_id;

grant select on v_user_usage_summary to authenticated;

comment on table user_usage is 'Tracks user activity metrics for upgrade prompts and retention';
comment on function increment_usage is 'Increments a usage metric for a user, auto-fetches org_id from profiles';

