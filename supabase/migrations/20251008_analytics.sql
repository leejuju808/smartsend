-- Core tables (idempotent)
create table if not exists public.campaigns (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  created_at timestamptz not null default now()
);

-- messages table (minimal fields, if not present)
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  sender_id uuid references public.senders(id) on delete set null,
  to_email text not null,
  subject text,
  body text,
  status text not null default 'queued', -- queued|sent|bounced|failed|replied
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  replied_at timestamptz,
  reply_intent text,        -- 'positive' | 'neutral' | 'negative' | null
  meeting_id uuid            -- backreference if reply → meeting is created
);

-- Add new columns to existing messages table if they don't exist
do $$ begin
  alter table public.messages add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
  alter table public.messages add column if not exists sent_at timestamptz;
  alter table public.messages add column if not exists replied_at timestamptz;
  alter table public.messages add column if not exists reply_intent text;
  alter table public.messages add column if not exists meeting_id uuid;
exception when others then null;
end $$;

-- meetings table (idempotent)
create table if not exists public.meetings (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  attendee_email text,
  source text default 'reply_intent',  -- 'reply_intent'|'manual'|'import'
  status text default 'scheduled',     -- 'scheduled'|'completed'|'canceled'|'no_show'
  scheduled_at timestamptz,            -- when meeting happens
  created_at timestamptz default now()
);

-- Add new columns to existing meetings table if they don't exist
do $$ begin
  alter table public.meetings add column if not exists profile_id uuid references profiles(id) on delete cascade;
  alter table public.meetings add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
  alter table public.meetings add column if not exists message_id uuid references public.messages(id) on delete set null;
  alter table public.meetings add column if not exists attendee_email text;
  alter table public.meetings add column if not exists source text default 'reply_intent';
  alter table public.meetings add column if not exists status text default 'scheduled';
  alter table public.meetings add column if not exists scheduled_at timestamptz;
exception when others then null;
end $$;

-- RLS
alter table public.campaigns enable row level security;
alter table public.messages enable row level security;
alter table public.meetings enable row level security;

drop policy if exists "own campaigns" on public.campaigns;
create policy "own campaigns" on public.campaigns
  for all using (auth.uid() = profile_id);

drop policy if exists "own messages" on public.messages;
create policy "own messages" on public.messages
  for all using (auth.uid() = profile_id);

drop policy if exists "own meetings" on public.meetings;
create policy "own meetings" on public.meetings
  for all using (auth.uid() = profile_id);

-- Helpful indexes
create index if not exists idx_messages_profile_campaign on public.messages(profile_id, campaign_id);
create index if not exists idx_messages_profile_status on public.messages(profile_id, status);
create index if not exists idx_messages_profile_reply on public.messages(profile_id, replied_at);
create index if not exists idx_meetings_profile_campaign on public.meetings(profile_id, campaign_id);
create index if not exists idx_meetings_profile_created on public.meetings(profile_id, created_at);

-- Utility: normalize date to user's current_date (UTC ok for MVP)
create or replace view public.v_msg_daily as
select
  m.profile_id,
  m.campaign_id,
  m.sender_id,
  (m.sent_at at time zone 'UTC')::date as d,
  count(*) filter (where m.status in ('sent','queued','failed')) as sent, -- attempted
  count(*) filter (where m.status = 'bounced') as bounced,
  count(*) filter (where m.replied_at is not null) as replies,
  count(*) filter (where m.reply_intent = 'positive') as positive_replies
from public.messages m
group by 1,2,3,4;

create or replace view public.v_meetings_daily as
select
  t.profile_id,
  t.campaign_id,
  (t.created_at at time zone 'UTC')::date as d,
  count(*) as meetings
from public.meetings t
group by 1,2,3;

-- Rollups for overview
create or replace view public.v_analytics_overview as
with msgs as (
  select profile_id,
         sum(sent) as sent,
         sum(bounced) as bounced,
         sum(replies) as replies,
         sum(positive_replies) as positive_replies
  from public.v_msg_daily
  group by 1
),
meets as (
  select profile_id, count(*) as meetings
  from public.meetings
  group by 1
)
select
  coalesce(msgs.profile_id, meets.profile_id) as profile_id,
  coalesce(msgs.sent,0) as sent,
  coalesce(msgs.bounced,0) as bounced,
  coalesce(msgs.replies,0) as replies,
  coalesce(msgs.positive_replies,0) as positive_replies,
  coalesce(meets.meetings,0) as meetings,
  case when coalesce(msgs.replies,0)=0 then 0
       else coalesce(meets.meetings,0)::numeric / msgs.replies * 100 end as meetings_per_100_replies -- MB/100
from msgs
full outer join meets using (profile_id);

-- Time series (last 30 days)
create or replace view public.v_analytics_timeseries as
select
  d.profile_id,
  d.d,
  d.campaign_id,
  d.sender_id,
  d.sent,
  d.bounced,
  d.replies,
  d.positive_replies,
  coalesce(m.meetings,0) as meetings,
  case when d.replies=0 then 0 else (coalesce(m.meetings,0)::numeric / d.replies) * 100 end as mb_per_100
from public.v_msg_daily d
left join public.v_meetings_daily m
  on m.profile_id = d.profile_id and m.campaign_id is not distinct from d.campaign_id and m.d = d.d
where d.d >= (current_date - interval '30 days')::date;

-- Campaign-level snapshot
create or replace view public.v_analytics_by_campaign as
with base as (
  select campaign_id, profile_id,
         sum(sent) as sent, sum(bounced) as bounced, sum(replies) as replies, sum(positive_replies) as positive_replies
  from public.v_msg_daily
  group by 1,2
),
meets as (
  select campaign_id, profile_id, count(*) as meetings
  from public.meetings
  group by 1,2
)
select
  b.profile_id, b.campaign_id,
  b.sent, b.bounced, b.replies, b.positive_replies,
  coalesce(m.meetings,0) as meetings,
  case when b.replies=0 then 0 else (coalesce(m.meetings,0)::numeric / b.replies) * 100 end as mb_per_100
from base b
left join meets m using (profile_id, campaign_id);
