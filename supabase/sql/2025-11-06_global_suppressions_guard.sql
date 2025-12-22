-- Deliverability guardrails: global suppressions, tenant knobs, queue guard
-- Run in Supabase SQL (idempotent)

-- A) Global suppressions (tenant-wide: by email or domain)
create table if not exists public.global_suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext,
  domain citext,
  kind text not null check (kind in ('manual','bounce','complaint','provider','role-account','trap')),
  reason text,
  unique (user_id, email, kind),
  unique (user_id, domain, kind),
  check ((email is not null) or (domain is not null))
);

create index if not exists idx_global_supp_user_email on public.global_suppressions(user_id, email);
create index if not exists idx_global_supp_user_domain on public.global_suppressions(user_id, domain);

-- B) Campaign-level suppression preferences (toggles)
alter table public.campaigns
  add column if not exists respect_global_suppressions boolean not null default true,
  add column if not exists respect_cross_campaign_unsubs boolean not null default true,
  add column if not exists respect_domain_blocks boolean not null default true;

-- C) Per-recipient daily guard (tenant knobs)
create table if not exists public.tenant_sending_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  per_recipient_daily_cap int not null default 1,
  dedupe_window_minutes int not null default 10
);

-- D) Fast email access on leads (already present; ensure index)
create index if not exists idx_leads_user_email on public.leads(user_id, email);

-- E) Partial uniqueness: only one active queue item per (campaign, lead, step) at a time
drop index if exists uq_active_queue_per_step;
create unique index uq_active_queue_per_step on public.send_queue(campaign_id, lead_id, step_no)
where status in ('pending','scheduled','deferred','sending');

-- F) Helper: tenant for a campaign
create or replace function public.campaign_owner(p_campaign uuid)
returns uuid
language sql
stable
as $$
  select coalesce(c.owner_id, c.user_id) from public.campaigns c where c.id = p_campaign
$$;

-- G) Helper: domain from email
create or replace function public.email_domain(p_email citext)
returns citext
language sql
immutable
as $$
  select case
    when p_email is null then null::citext
    when position('@' in p_email::text) > 0 then split_part(p_email::text, '@', 2)::citext
    else null::citext
  end
$$;

-- H) Is suppressed for this campaign? (checks campaign, global, and cross-campaign unsubs)
create or replace function public.is_suppressed_for_campaign(p_campaign uuid, p_email citext)
returns table(is_blocked boolean, reason text)
language plpgsql
stable
as $$
declare
  v_user uuid;
  v_dom citext;
  v_reason text := '';
  v_block boolean := false;
  v_respect_global boolean := true;
  v_respect_cross boolean := true;
  v_respect_domain boolean := true;
begin
  v_user := public.campaign_owner(p_campaign);
  if v_user is null then
    return query select true, 'campaign_owner_missing';
  end if;

  select respect_global_suppressions, respect_cross_campaign_unsubs, respect_domain_blocks
    into v_respect_global, v_respect_cross, v_respect_domain
  from public.campaigns where id = p_campaign;

  v_dom := public.email_domain(p_email);

  -- 1) Campaign-local suppressions
  if exists (
    select 1 from public.campaign_suppressions s
    where s.campaign_id = p_campaign and (s.email = p_email or s.email = v_dom)
  ) then
    v_block := true; v_reason := 'campaign_suppression';
  end if;

  -- 2) Global tenant suppressions (email or domain)
  if not v_block and v_respect_global then
    if exists (
      select 1 from public.global_suppressions g
      where g.user_id = v_user
        and (
          (g.email is not null and g.email = p_email)
          or (v_respect_domain and g.domain is not null and g.domain = v_dom)
        )
    ) then
      v_block := true; v_reason := 'global_suppression';
    end if;
  end if;

  -- 3) Cross-campaign unsubscribe (same tenant)
  if not v_block and v_respect_cross then
    if exists (
      select 1
      from public.campaign_unsubscribes u
      join public.campaigns c on c.id = u.campaign_id
      where c.user_id = v_user
        and u.email = p_email
    ) then
      v_block := true; v_reason := 'cross_campaign_unsubscribe';
    end if;
  end if;

  return query select v_block, v_reason;
end;
$$;

-- I) Per-recipient daily cap check (tenant-wide)
create or replace function public.recipient_remaining_today_tenant(p_campaign uuid, p_email citext, p_now timestamptz default now())
returns int
language plpgsql
stable
as $$
declare
  v_user uuid;
  v_cap int := 1;
  v_used int := 0;
  v_start timestamptz;
  v_end timestamptz;
begin
  v_user := public.campaign_owner(p_campaign);
  select per_recipient_daily_cap into v_cap from public.tenant_sending_prefs where user_id = v_user;
  if v_cap is null then v_cap := 1; end if;

  v_start := date_trunc('day', p_now);
  v_end := v_start + interval '1 day';

  select count(*) into v_used
  from public.send_logs sl
  join public.campaigns c on c.id = sl.campaign_id
  where c.user_id = v_user
    and sl.to_email = p_email
    and sl.created_at >= v_start and sl.created_at < v_end;

  return greatest(v_cap - coalesce(v_used,0), 0);
end;
$$;

-- J) Guard: cancel or defer queue items that violate rules
create or replace function public.guard_queue_item(p_queue uuid, p_now timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  q record;
  v_email citext;
  v_block boolean;
  v_reason text;
  v_remaining int;
  v_dedupe_minutes int := 10;
  v_user uuid;
begin
  select q.*, l.email as lead_email, c.user_id as owner
    into q
  from public.send_queue q
  join public.leads l on l.id = q.lead_id
  join public.campaigns c on c.id = q.campaign_id
  where q.id = p_queue;

  if not found then
    return 'missing';
  end if;

  v_email := q.lead_email;
  v_user := q.owner;

  -- A) suppression checks
  select is_blocked, reason into v_block, v_reason
  from public.is_suppressed_for_campaign(q.campaign_id, v_email);

  if v_block then
    update public.send_queue
      set status = 'canceled',
          canceled_reason = coalesce(v_reason, 'suppressed'),
          updated_at = p_now
    where id = q.id;
    return 'canceled';
  end if;

  -- B) per-recipient daily cap
  v_remaining := public.recipient_remaining_today_tenant(q.campaign_id, v_email, p_now);
  if v_remaining <= 0 then
    update public.send_queue
      set status = 'deferred',
          not_before = date_trunc('day', p_now) + interval '1 day',
          updated_at = p_now
    where id = q.id;
    return 'deferred-cap';
  end if;

  -- C) dedupe window: don't allow another queued send for same tenant + email within N minutes
  select dedupe_window_minutes into v_dedupe_minutes from public.tenant_sending_prefs where user_id = v_user;
  if v_dedupe_minutes is null then v_dedupe_minutes := 10; end if;

  if exists (
    select 1
    from public.send_queue other
    join public.leads ol on ol.id = other.lead_id
    join public.campaigns oc on oc.id = other.campaign_id
    where oc.user_id = v_user
      and ol.email = v_email
      and other.id <> q.id
      and other.status in ('pending','scheduled','deferred','sending')
      and other.created_at >= (p_now - make_interval(mins => v_dedupe_minutes))
  ) then
    update public.send_queue
      set status = 'deferred',
          not_before = p_now + make_interval(mins => v_dedupe_minutes),
          updated_at = p_now
    where id = q.id;
    return 'deferred-dedupe';
  end if;

  return 'ok';
end;
$$;

-- K) Helper: promote provider events to global suppressions
create or replace function public.promote_bounce_to_global(
  p_campaign uuid,
  p_email citext,
  p_kind text default 'bounce',
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.campaign_owner(p_campaign);
  v_id uuid;
begin
  if v_user is null then
    return null;
  end if;

  insert into public.global_suppressions(user_id, email, kind, reason)
  values (v_user, p_email, p_kind, p_reason)
  on conflict (user_id, email, kind) do update
    set reason = coalesce(excluded.reason, public.global_suppressions.reason)
  returning id into v_id;

  return v_id;
end;
$$;


