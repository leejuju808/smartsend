-- Meeting intents storage + helpers
-- Run in Supabase SQL

-- A) per-thread meeting intent (latest wins via upsert)
create table if not exists public.meeting_intents (
  thread_id uuid primary key references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  detected_at timestamptz not null default now(),
  source_message_id uuid not null references public.inbox_messages(id) on delete cascade,
  lead_tz text,
  my_tz text,
  cal_link text,
  summary text,
  slots jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_meeting_intents_campaign
  on public.meeting_intents(campaign_id);

create index if not exists idx_meeting_intents_lead
  on public.meeting_intents(lead_id);

-- B) helper: fetch account tz (fallback America/Los_Angeles)
drop function if exists public.account_tz(uuid);

create or replace function public.account_tz(p_account uuid)
returns text
language sql
stable
as $$
  select coalesce(
    (meta->>'tz'),
    'America/Los_Angeles'
  )
  from public.connected_accounts
  where id = p_account
$$;

-- C) helper: campaign default calendar link
drop function if exists public.campaign_cal_link(uuid);

create or replace function public.campaign_cal_link(p_campaign uuid)
returns text
language sql
stable
as $$
  with c as (
    select c.from_account_id, c.meta as cmeta
    from public.campaigns c
    where c.id = p_campaign
  ), a as (
    select (ca.meta->>'cal_link') as alink
    from c
    join public.connected_accounts ca on ca.id = c.from_account_id
  )
  select coalesce(
    (select alink from a),
    (select cmeta->>'cal_link' from c)
  );
$$;





