-- Canonical suppression model migration
-- 1) Replace legacy suppressions schema with scoped model

create extension if not exists pgcrypto;

-- Drop legacy triggers/functions that depend on old schema
drop trigger if exists trg_capture_suppression on public.deliverability_events;
drop trigger if exists trg_prevent_suppressed_enqueue on public.send_queue;

drop function if exists public.capture_suppression_from_event();
drop function if exists public.prevent_suppressed_enqueue();
drop function if exists public.is_suppressed(uuid, text, text);
drop function if exists public.upsert_suppression(uuid, text, text, text, text);
drop function if exists public.domain_is_suppressed(text);
drop function if exists public.domain_is_suppressed(text, uuid, uuid);
drop function if exists public.add_suppression(text, text, text, text, uuid, uuid, text);
drop function if exists public.norm_email(text);
drop function if exists public.email_domain(text);
drop function if exists public.email_localpart(text);

drop table if exists public.suppressions cascade;

create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  scope text not null check (scope in ('global','account','campaign')),
  account_id uuid references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  kind text not null check (kind in ('email','domain','role')),
  value text not null,
  reason text,
  note text,
  unique (
    scope,
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'),
    coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'),
    kind,
    value
  )
);

create index if not exists idx_suppressions_kind_value on public.suppressions(kind, value);
create index if not exists idx_suppressions_scope on public.suppressions(scope, account_id, campaign_id);

-- 2) Lead helpers ------------------------------------------------------------

alter table public.leads
  add column if not exists email_norm text generated always as (lower(trim(email))) stored,
  add column if not exists domain text generated always as (split_part(lower(email), '@', 2)) stored;

-- 3) Normalization helpers ---------------------------------------------------

create or replace function public.norm_email(p text)
returns text
language sql
immutable
as $$
  select case when p is null then null else lower(trim(p)) end
$$;

create or replace function public.email_localpart(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null then null
    else split_part(public.norm_email(p), '@', 1)
  end
$$;

create or replace function public.email_domain(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null then null
    else split_part(public.norm_email(p), '@', 2)
  end
$$;

-- 4) Scoped suppression checks -----------------------------------------------

create or replace function public.is_suppressed(
  p_email text,
  p_account uuid default null,
  p_campaign uuid default null
)
returns boolean
language sql
stable
as $$
  with e as (
    select
      public.norm_email(p_email) as em,
      public.email_domain(p_email) as dm,
      public.email_localpart(p_email) as lp
  ),
  hits as (
    select 1
    from e, public.suppressions s
    where
      (
        s.scope = 'global'
        or (s.scope = 'account' and s.account_id = p_account)
        or (s.scope = 'campaign' and s.campaign_id = p_campaign)
      )
      and (
        (s.kind = 'email' and s.value = e.em)
        or (s.kind = 'domain' and s.value = e.dm)
        or (s.kind = 'role' and s.value = e.lp)
      )
    limit 1
  )
  select exists(select 1 from hits)
$$;

create or replace function public.domain_is_suppressed(
  p_domain text,
  p_account uuid default null,
  p_campaign uuid default null
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.suppressions s
    where s.kind = 'domain'
      and s.value = lower(trim(p_domain))
      and (
        s.scope = 'global'
        or (s.scope = 'account' and s.account_id = p_account)
        or (s.scope = 'campaign' and s.campaign_id = p_campaign)
      )
  )
$$;

-- 5) Upsert helper -----------------------------------------------------------

create or replace function public.add_suppression(
  p_scope text,
  p_kind text,
  p_value text,
  p_reason text default 'manual',
  p_account uuid default null,
  p_campaign uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
as $$
declare
  rid uuid;
  v_scope text;
  v_kind text;
  v_value text;
begin
  v_scope := lower(trim(p_scope));
  v_kind := lower(trim(p_kind));
  v_value := public.norm_email(p_value);

  if v_scope not in ('global','account','campaign') then
    raise exception 'invalid scope %', p_scope;
  end if;

  if v_kind not in ('email','domain','role') then
    raise exception 'invalid kind %', p_kind;
  end if;

  if v_value is null then
    raise exception 'value required';
  end if;

  insert into public.suppressions(scope, account_id, campaign_id, kind, value, reason, note)
  values (v_scope, p_account, p_campaign, v_kind,
          case
            when v_kind = 'domain' then lower(trim(p_value))
            when v_kind = 'role' then lower(trim(p_value))
            else v_value
          end,
          coalesce(p_reason, 'manual'),
          p_note)
  on conflict (
    scope,
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'),
    coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'),
    kind,
    value
  )
  do update
    set reason = excluded.reason,
        note = coalesce(excluded.note, public.suppressions.note)
  returning id into rid;

  return rid;
end;
$$;

-- 6) Deliverability auto-capture ---------------------------------------------

create or replace function public.capture_suppression_from_event()
returns trigger
language plpgsql
as $$
declare
  em text;
  dm text;
  reason text;
begin
  if new.event_type not in ('bounce','complaint') then
    return new;
  end if;

  select email_norm, domain
  into em, dm
  from public.leads
  where id = new.lead_id;

  if em is null then
    return new;
  end if;

  reason := case
    when new.event_type = 'complaint' then 'complaint'
    when (new.meta ->> 'bounce_type') ilike '%hard%' then 'hard_bounce'
    else 'bounce'
  end;

  insert into public.suppressions(scope, kind, value, reason)
  values ('global', 'email', em, reason)
  on conflict do nothing;

  return new;
end;
$$;

create trigger trg_capture_suppression
after insert on public.deliverability_events
for each row execute function public.capture_suppression_from_event();

-- 7) Queue guard -------------------------------------------------------------

create or replace function public.prevent_suppressed_enqueue()
returns trigger
language plpgsql
as $$
declare
  em text;
  acc uuid;
  camp uuid;
begin
  select email_norm into em
  from public.leads
  where id = new.lead_id;

  acc := new.account_id;
  camp := new.campaign_id;

  if em is null then
    return new;
  end if;

  if public.is_suppressed(em, acc, camp) then
    raise exception 'enqueue blocked: % is suppressed', em;
  end if;

  return new;
end;
$$;

create trigger trg_prevent_suppressed_enqueue
before insert on public.send_queue
for each row execute function public.prevent_suppressed_enqueue();

-- 8) Seeds -------------------------------------------------------------------

insert into public.suppressions(scope, kind, value, reason)
select 'global', 'role', seed.val, 'role'
from (values
  ('info'), ('support'), ('help'), ('admin'), ('no-reply'), ('noreply'),
  ('postmaster'), ('sales'), ('marketing'), ('privacy'), ('security')
) seed(val)
on conflict do nothing;

insert into public.suppressions(scope, kind, value, reason)
values
  ('global', 'domain', 'example.com', 'test_domain'),
  ('global', 'domain', 'mailinator.com', 'disposable'),
  ('global', 'domain', 'tempmail.com', 'disposable')
on conflict do nothing;

-- 9) Grants ------------------------------------------------------------------

grant execute on function public.is_suppressed(text, uuid, uuid) to authenticated, service_role;
grant execute on function public.domain_is_suppressed(text, uuid, uuid) to authenticated, service_role;
grant execute on function public.add_suppression(text, text, text, text, uuid, uuid, text) to authenticated, service_role;

-- 10) Compatibility overloads ------------------------------------------------

create or replace function public.is_suppressed(p_email text, p_account uuid)
returns boolean
language sql
stable
as $$
  select public.is_suppressed(p_email, p_account, null)
$$;

create or replace function public.is_suppressed(p_email text, p_org uuid)
returns boolean
language sql
stable
as $$
  select public.is_suppressed(p_email, p_org, null)
$$;

grant execute on function public.is_suppressed(text, uuid) to authenticated, service_role;


