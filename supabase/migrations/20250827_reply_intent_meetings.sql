-- Create meetings table scoped by profile_id for RLS
create extension if not exists pgcrypto;

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  status text not null check (status in ('proposed','booked','cancelled')),
  calendly_event_uri text,
  calendly_invitee_uri text,
  scheduled_at timestamptz,
  title text default 'Intro call',
  location text default 'Google Meet (Calendly)',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_meetings_profile on public.meetings(profile_id);
create index if not exists idx_meetings_status on public.meetings(status);
create index if not exists idx_meetings_scheduled_at on public.meetings(scheduled_at);

-- Trigger to auto-update updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_meetings_touch on public.meetings;
create trigger trg_meetings_touch before update on public.meetings
for each row execute function public.touch_updated_at();

-- RLS
alter table public.meetings enable row level security;

-- Only owner (profile_id = auth.uid()) can CRUD their rows
drop policy if exists p_meetings_select on public.meetings;
create policy p_meetings_select on public.meetings
for select using (profile_id = auth.uid());

drop policy if exists p_meetings_insert on public.meetings;
create policy p_meetings_insert on public.meetings
for insert with check (profile_id = auth.uid());

drop policy if exists p_meetings_update on public.meetings;
create policy p_meetings_update on public.meetings
for update using (profile_id = auth.uid());

drop policy if exists p_meetings_delete on public.meetings;
create policy p_meetings_delete on public.meetings
for delete using (profile_id = auth.uid());

-- Lightweight materialized metrics view (refreshable) for analytics tile
create materialized view if not exists public.mv_reply_to_meeting_metrics as
with replies as (
  select profile_id,
         count(*) filter (where direction = 'inbound') as replies
  from public.messages
  group by 1
),
meetings as (
  select profile_id,
         count(*) filter (where status='booked') as booked,
         count(*) filter (where status in ('proposed','booked')) as intents
  from public.meetings
  group by 1
)
select
  coalesce(r.profile_id, m.profile_id) as profile_id,
  coalesce(r.replies, 0) as replies,
  coalesce(m.booked, 0) as booked,
  coalesce(m.intents, 0) as intents,
  case when coalesce(r.replies,0) = 0 then 0
       else round( (coalesce(m.booked,0)::decimal / greatest(r.replies,1)) * 100, 2)
  end as mb_per_100 -- Meetings Booked per 100 Replies
from replies r
full join meetings m on m.profile_id = r.profile_id;

create unique index if not exists mv_reply_to_meeting_metrics_pk
on public.mv_reply_to_meeting_metrics(profile_id);

-- Helper to refresh the MV (call from server securely)
create or replace function public.refresh_reply_meeting_metrics()
returns void language sql security definer set search_path = public as $$
  refresh materialized view concurrently public.mv_reply_to_meeting_metrics;
$$;

revoke all on function public.refresh_reply_meeting_metrics() from public;
grant execute on function public.refresh_reply_meeting_metrics() to authenticated; 