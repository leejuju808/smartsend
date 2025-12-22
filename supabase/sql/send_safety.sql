-- /supabase/sql/send_safety.sql
-- SmartSendAI — Send Safety Guardrails
-- This adds campaign_contacts join, messages table, RLS, and two RPCs:
--   1) compute_campaign_send_safety(profile_id, campaign_id)
--   2) enqueue_campaign_safely(profile_id, campaign_id)
-- It also enforces DB-level blocking of suppressed emails on messages inserts.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- Assumes these already exist (from earlier slice):
-- public.profiles(id uuid primary key)
-- public.contacts(...)
-- public.suppressions(...)
-- public.normalize_email(text)

-- 0) Minimal campaigns table (safe if exists elsewhere)
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text,
  created_at timestamptz default now()
);

-- 1) Join table: campaign ↔ contacts
create table if not exists public.campaign_contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz default now(),
  constraint campaign_contacts_unique unique (campaign_id, contact_id)
);
create index if not exists cc_profile_id_idx on public.campaign_contacts(profile_id);
create index if not exists cc_campaign_id_idx on public.campaign_contacts(campaign_id);

-- 2) messages table: enqueue per contact per campaign
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  to_email text not null,
  status text not null default 'queued', -- queued | sent | failed | skipped
  error text,
  created_at timestamptz default now()
);

-- dedupe same contact per campaign
create unique index if not exists messages_unique_campaign_contact
  on public.messages(campaign_id, contact_id);

-- indexes for faster lookups
create index if not exists messages_profile_idx on public.messages(profile_id);
create index if not exists messages_campaign_idx on public.messages(campaign_id);

-- 3) RLS (owner-only) for campaigns, campaign_contacts, and messages
alter table public.campaigns enable row level security;
alter table public.campaign_contacts enable row level security;
alter table public.messages enable row level security;

drop policy if exists "campaigns_rw_own" on public.campaigns;
create policy "campaigns_rw_own" on public.campaigns
for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists "cc_rw_own" on public.campaign_contacts;
create policy "cc_rw_own" on public.campaign_contacts
for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists "messages_rw_own" on public.messages;
create policy "messages_rw_own" on public.messages
for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- 4) Normalize to_email on messages
create or replace function public.tg_normalize_to_email()
returns trigger
language plpgsql
as $$
begin
  if new.to_email is not null then
    new.to_email := public.normalize_email(new.to_email);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_messages_normalize on public.messages;
create trigger trg_messages_normalize
before insert or update on public.messages
for each row execute function public.tg_normalize_to_email();

-- 5) Hard block suppressed emails at DB level
create or replace function public.is_email_suppressed(p_profile_id uuid, p_email text)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.suppressions s
    where s.profile_id = p_profile_id
      and public.normalize_email(s.email) = public.normalize_email(p_email)
  );
$$;

create or replace function public.tg_block_suppressed_messages()
returns trigger
language plpgsql
as $$
begin
  if public.is_email_suppressed(new.profile_id, new.to_email) then
    raise exception 'email_suppressed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_suppressed on public.messages;
create trigger trg_block_suppressed
before insert on public.messages
for each row execute function public.tg_block_suppressed_messages();

-- 6) RPC: compute send-safety stats for a campaign
create or replace function public.compute_campaign_send_safety(
  in_profile_id uuid,
  in_campaign_id uuid
)
returns table (
  rows_total int,
  distinct_total int,
  duplicates_in_campaign int,
  suppressed_count int,
  sendable_count int
)
language sql
security invoker
as $$
with raw as (
  select public.normalize_email(c.email) as email
  from public.campaign_contacts cc
  join public.contacts c on c.id = cc.contact_id
  where cc.profile_id = in_profile_id
    and cc.campaign_id = in_campaign_id
),
stats as (
  select
    count(*)::int as rows_total,
    count(distinct email)::int as distinct_total,
    (count(*) - count(distinct email))::int as duplicates_in_campaign
  from raw
),
supp as (
  select count(distinct r.email)::int as suppressed_count
  from raw r
  where exists (
    select 1
    from public.suppressions s
    where s.profile_id = in_profile_id
      and s.email = r.email
  )
)
select
  stats.rows_total,
  stats.distinct_total,
  stats.duplicates_in_campaign,
  coalesce(supp.suppressed_count, 0) as suppressed_count,
  greatest(stats.distinct_total - coalesce(supp.suppressed_count, 0), 0) as sendable_count
from stats, supp;
$$;

grant execute on function public.compute_campaign_send_safety(uuid, uuid) to authenticated;

-- 7) RPC: enqueue a campaign safely (skip suppressed + duplicates)
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
  -- Compute distinct + suppressed in one go
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

  return query select
    coalesce(v_inserted,0)::int as inserted_count,
    coalesce(v_suppressed,0)::int as skipped_suppressed,
    coalesce(v_skipped_dup,0)::int as skipped_duplicates;
end;
$$;

grant execute on function public.enqueue_campaign_safely(uuid, uuid) to authenticated;

-- Helpful comments
comment on table public.campaign_contacts is 'Join table for campaign recipients; unique per (campaign_id, contact_id).';
comment on table public.messages is 'Per-recipient send queue with DB-level suppression blocking.';
comment on function public.compute_campaign_send_safety(uuid, uuid) is 'Compute duplicates/suppressed/sendable counts for a campaign.';
comment on function public.enqueue_campaign_safely(uuid, uuid) is 'Insert messages for a campaign after filtering duplicates + suppressions.'; 