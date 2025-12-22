-- SmartSendAI — Sender Health Metrics (MB/100, bounce %, suppression hits)
-- Adds:
--  - meetings table (if missing)
--  - send_audits table (logs each enqueue summary)
--  - compute_sender_health RPC (7/30-day windows)
--  - updates enqueue_campaign_safely to log into send_audits

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- 0) meetings table (minimal, owner-only)
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  starts_at timestamptz,                -- optional if you store booked time
  source text,                          -- "calendly", "ics", etc.
  created_at timestamptz default now()
);

alter table public.meetings enable row level security;

drop policy if exists "meetings_rw_own" on public.meetings;
create policy "meetings_rw_own" on public.meetings
for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- 1) Optional: expand messages.status domain to include 'sent' and 'replied'
-- (No-op if already allowed; text column doesn't need enum change.)
-- We will rely on these values if you set them from your mailer/webhooks.

-- 2) send_audits table: one row per "Send X safely" action
create table if not exists public.send_audits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  inserted_count int not null default 0,       -- queued
  skipped_suppressed int not null default 0,
  skipped_duplicates int not null default 0,
  created_at timestamptz default now()
);

alter table public.send_audits enable row level security;

drop policy if exists "send_audits_rw_own" on public.send_audits;
create policy "send_audits_rw_own" on public.send_audits
for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create index if not exists send_audits_profile_idx on public.send_audits(profile_id);
create index if not exists send_audits_campaign_idx on public.send_audits(campaign_id);
create index if not exists send_audits_created_idx on public.send_audits(created_at);

-- 3) REPLACE enqueue_campaign_safely to also log into send_audits
create or replace function public.enqueue_campaign_safely(
  in_profile_id uuid,
  in_campaign_id uuid
)
returns table (
  inserted_count int,
  skipped_suppressed int,
  skipped_duplicates int
)
language plpgsql
security invoker
as $$
declare
  v_rows_total int;
  v_distinct_total int;
  v_suppressed int;
  v_inserted int;
  v_skipped_dup int;
begin
  with raw as (
    select public.normalize_email(c.email) as email, c.id as contact_id
    from public.campaign_contacts cc
    join public.contacts c on c.id = cc.contact_id
    where cc.profile_id = in_profile_id
      and cc.campaign_id = in_campaign_id
  ),
  dedup as (
    select min(contact_id) as contact_id, email, count(*) as cnt
    from raw
    group by email
  ),
  filtered as (
    select d.contact_id, d.email, d.cnt
    from dedup d
    where not exists (
      select 1 from public.suppressions s
      where s.profile_id = in_profile_id
        and s.email = d.email
    )
  ),
  ins as (
    insert into public.messages (profile_id, campaign_id, contact_id, to_email, status)
    select in_profile_id, in_campaign_id, f.contact_id, f.email, 'queued'
    from filtered f
    on conflict (campaign_id, contact_id) do nothing
    returning 1
  )
  select
    (select count(*) from raw) as rows_total,
    (select count(*) from dedup) as distinct_total,
    (select coalesce(sum(cnt - 1),0) from dedup) as duplicates,
    (select (select count(*) from dedup) - (select count(*) from filtered)) as suppressed,
    (select count(*) from ins) as inserted
  into v_rows_total, v_distinct_total, v_skipped_dup, v_suppressed, v_inserted;

  -- Log audit
  insert into public.send_audits (profile_id, campaign_id, inserted_count, skipped_suppressed, skipped_duplicates)
  values (in_profile_id, in_campaign_id, coalesce(v_inserted,0), coalesce(v_suppressed,0), coalesce(v_skipped_dup,0));

  return query select
    coalesce(v_inserted,0)::int as inserted_count,
    coalesce(v_suppressed,0)::int as skipped_suppressed,
    coalesce(v_skipped_dup,0)::int as skipped_duplicates;
end;
$$;

grant execute on function public.enqueue_campaign_safely(uuid, uuid) to authenticated;

-- 4) RPC: compute sender health window
-- Uses messages.status:
--   - sent messages counted when status = 'sent'
--   - failed considered bounces when status = 'failed'
--   - replies when status = 'replied'
-- meetings counted from public.meetings
create or replace function public.compute_sender_health(
  in_profile_id uuid,
  in_days int default 30
)
returns table (
  window_days int,
  sent int,
  failed int,
  bounce_rate_percent numeric,
  replies int,
  meetings int,
  mb_per_100 numeric,
  suppression_hits int
)
language sql
security invoker
as $$
with window_bounds as (
  select now() - make_interval(days => greatest(in_days,1)) as start_ts
),
msg as (
  select
    count(*) filter (where m.status = 'sent')::int as sent,
    count(*) filter (where m.status = 'failed')::int as failed,
    count(*) filter (where m.status = 'replied')::int as replies
  from public.messages m, window_bounds wb
  where m.profile_id = in_profile_id
    and m.created_at >= wb.start_ts
),
meet as (
  select count(*)::int as meetings
  from public.meetings t, window_bounds wb
  where t.profile_id = in_profile_id
    and t.created_at >= wb.start_ts
),
supa as (
  select coalesce(sum(sa.skipped_suppressed),0)::int as suppression_hits
  from public.send_audits sa, window_bounds wb
  where sa.profile_id = in_profile_id
    and sa.created_at >= wb.start_ts
)
select
  in_days as window_days,
  coalesce(msg.sent,0) as sent,
  coalesce(msg.failed,0) as failed,
  case when coalesce(msg.sent,0) = 0 then 0
       else round((coalesce(msg.failed,0)::numeric / nullif(msg.sent,0)) * 100, 2)
  end as bounce_rate_percent,
  coalesce(msg.replies,0) as replies,
  coalesce(meet.meetings,0) as meetings,
  case when coalesce(msg.replies,0) = 0 then 0
       else round((coalesce(meet.meetings,0)::numeric / nullif(msg.replies,0)) * 100, 2)
  end as mb_per_100,
  coalesce(supa.suppression_hits,0) as suppression_hits
from msg, meet, supa;
$$;

grant execute on function public.compute_sender_health(uuid, int) to authenticated;

comment on table public.meetings is 'Booked meetings per user (owner-only via RLS).';
comment on table public.send_audits is 'Audit log for each enqueue run; powers suppression hit counts.';
comment on function public.compute_sender_health(uuid, int) is 'Returns MB/100, bounce %, replies, meetings, suppression hits over N days.'; 