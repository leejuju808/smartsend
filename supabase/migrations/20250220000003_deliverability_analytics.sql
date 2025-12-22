-- 0.1 Normalize complaint events (optional; tie into future providers)
create table if not exists public.complaint_logs (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.sender_profiles(id) on delete cascade,
  campaign_id uuid references public.campaigns(id),
  lead_id uuid references public.campaign_leads(id),
  source text, -- 'gmail','ses','mailgun', etc.
  reason text,
  created_at timestamptz default now()
);

alter table public.complaint_logs enable row level security;

create policy "complaints read own" on public.complaint_logs
for select using (exists (select 1 from public.sender_profiles s where s.id=complaint_logs.sender_id and s.user_id=auth.uid()));

-- 0.2 Daily aggregates (per team, per day)
create materialized view if not exists public.mv_deliverability_daily as
with sends as (
  select c.team_id, date_trunc('day', sl.sent_at) as day, count(*)::int as sent
  from public.send_logs sl
  join public.campaigns c on c.id = sl.campaign_id
  where c.team_id is not null
  group by 1,2
),
soft as (
  select s.team_id, date_trunc('day', b.created_at) as day, count(*)::int as soft_bounces
  from public.bounce_logs b
  join public.sender_profiles s on s.id = b.sender_id
  where b.type = 'soft'
  group by 1,2
),
hard as (
  select s.team_id, date_trunc('day', b.created_at) as day, count(*)::int as hard_bounces
  from public.bounce_logs b
  join public.sender_profiles s on s.id = b.sender_id
  where b.type = 'hard'
  group by 1,2
),
complaints as (
  select s.team_id, date_trunc('day', c.created_at) as day, count(*)::int as complaints
  from public.complaint_logs c
  join public.sender_profiles s on s.id = c.sender_id
  group by 1,2
),
replies as (
  select c.team_id, date_trunc('day', cl.created_at) as day, count(*)::int as replies
  from public.campaign_leads cl
  join public.campaigns c on c.id = cl.campaign_id
  where cl.replied = true
    and c.team_id is not null
  group by 1,2
)
select
  coalesce(sends.team_id, soft.team_id, hard.team_id, complaints.team_id, replies.team_id) as team_id,
  coalesce(sends.day, soft.day, hard.day, complaints.day, replies.day) as day,
  coalesce(sends.sent,0) as sent,
  coalesce(soft.soft_bounces,0) as soft_bounces,
  coalesce(hard.hard_bounces,0) as hard_bounces,
  coalesce(complaints.complaints,0) as complaints,
  coalesce(replies.replies,0) as replies
from sends
full join soft using (team_id, day)
full join hard using (team_id, day)
full join complaints using (team_id, day)
full join replies using (team_id, day);

create index if not exists idx_mv_deliverability_daily on public.mv_deliverability_daily(team_id, day desc);

-- 0.3 Secure the MV
grant select on public.mv_deliverability_daily to anon, authenticated;

-- 0.4 Ensure sender_profiles has team_id field for aggregation
do $$
begin
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'sender_profiles' and column_name = 'team_id') then
    alter table public.sender_profiles add column team_id uuid references public.teams(id) on delete set null;
  end if;
end $$;

-- 0.5 Update MV for team_id-based soft/hard/complaints (if sender_profiles.team_id available)
-- Note: The MV above uses sender_id join to get team_id, which assumes a relationship
-- You may need to adjust based on your actual sender_profiles schema

-- 0.6 Helper function to decrement sender health score
create or replace function public.decrement_sender_health(
  sender_id uuid,
  decrement numeric default 10
) returns void
language plpgsql
security definer
as $$
begin
  update public.sender_profiles
  set health_score = greatest(0, health_score - decrement)
  where id = sender_id;
end;
$$;

grant execute on function public.decrement_sender_health(uuid, numeric) to authenticated;

