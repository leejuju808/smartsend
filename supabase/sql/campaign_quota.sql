-- Campaign quota configuration & enforcement
-- Run in Supabase SQL editor

-- A) Quota kinds (extend as you grow)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'quota_kind') then
    create type public.quota_kind as enum ('send', 'followup_send');
  end if;
end$$;

-- B) Campaign quota config (per window)
create table if not exists public.campaign_quota (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  kind public.quota_kind not null default 'send',
  window text not null check (window in ('minute','hour','day')),
  limit_count int not null check (limit_count > 0),
  primary key (campaign_id, kind, window)
);

-- Sensible defaults (UPSERT)
insert into public.campaign_quota (campaign_id, kind, window, limit_count)
select c.id, 'send', 'day', 500 from public.campaigns c
on conflict do nothing;

-- C) Quota usage log (append-only)
create table if not exists public.quota_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  kind public.quota_kind not null,
  window text not null check (window in ('minute','hour','day')),
  qty int not null check (qty > 0),
  actor_user_id uuid references auth.users(id) on delete set null
);
create index if not exists idx_qusage_campaign_window on public.quota_usage(campaign_id, window, created_at desc);
create index if not exists idx_qusage_kind on public.quota_usage(kind);

-- D) RLS (readable by viewers; writes via RPC)
alter table public.campaign_quota  enable row level security;
alter table public.quota_usage     enable row level security;

drop policy if exists "quota_read" on public.campaign_quota;
create policy "quota_read" on public.campaign_quota
  for select to authenticated using (public.is_campaign_viewer(campaign_id));

drop policy if exists "qusage_read" on public.quota_usage;
create policy "qusage_read" on public.quota_usage
  for select to authenticated using (public.is_campaign_viewer(campaign_id));

-- E) RPC — enforce & record usage atomically
create or replace function public.enforce_campaign_quota(
  p_campaign uuid,
  p_kind public.quota_kind,
  p_qty int default 1
) returns boolean
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_ok boolean := true;
  r record;
  v_start timestamptz;
  v_used int;
begin
  if not (public.is_campaign_owner(p_campaign) or public.is_campaign_editor(p_campaign) or public.is_campaign_viewer(p_campaign)) then
    return false;
  end if;

  for r in
    select window, limit_count from public.campaign_quota
    where campaign_id = p_campaign and kind = p_kind
  loop
    -- compute bucket start
    v_start := case r.window
      when 'minute' then date_trunc('minute', v_now)
      when 'hour'   then date_trunc('hour',   v_now)
      when 'day'    then date_trunc('day',    v_now)
    end;

    select coalesce(sum(qty),0) into v_used
    from public.quota_usage
    where campaign_id = p_campaign
      and kind = p_kind
      and window = r.window
      and created_at >= v_start;

    if v_used + p_qty > r.limit_count then
      v_ok := false;
      exit;
    end if;
  end loop;

  if not v_ok then return false; end if;

  -- Record usage once per window type
  insert into public.quota_usage (campaign_id, kind, window, qty, actor_user_id)
  select p_campaign, p_kind, q.window, p_qty, auth.uid()
  from public.campaign_quota q
  where q.campaign_id = p_campaign and q.kind = p_kind;

  return true;
end;
$$;

-- Usage snapshot helper
create or replace function public.quota_snapshot(p_campaign uuid)
returns table(kind public.quota_kind, window text, used int, limit_count int) 
language sql stable as $$
  with cfg as (
    select campaign_id, kind, window, limit_count
    from public.campaign_quota
    where campaign_id = p_campaign
  ),
  used as (
    select kind, window,
      sum(case when window='minute' then qty else 0 end) filter (where created_at >= date_trunc('minute', now())) as used_minute,
      sum(case when window='hour'   then qty else 0 end) filter (where created_at >= date_trunc('hour',   now())) as used_hour,
      sum(case when window='day'    then qty else 0 end) filter (where created_at >= date_trunc('day',    now())) as used_day
    from public.quota_usage
    where campaign_id = p_campaign
    group by kind, window
  )
  select c.kind, c.window,
         case c.window
           when 'minute' then coalesce(u.used_minute,0)
           when 'hour'   then coalesce(u.used_hour,0)
           when 'day'    then coalesce(u.used_day,0)
         end as used,
         c.limit_count
  from cfg c
  left join used u on u.kind = c.kind and u.window = c.window;
$$;




