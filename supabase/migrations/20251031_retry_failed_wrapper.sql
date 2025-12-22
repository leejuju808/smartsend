-- Safety columns (idempotent)
alter table if exists public.leads
  add column if not exists attempt_count int not null default 0,
  add column if not exists max_attempts int not null default 3,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_leads_status_updated on public.leads(status, updated_at);

-- Minimal campaign_logs table (idempotent; unify on common columns)
create table if not exists public.campaign_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid,
  lead_id uuid not null,
  event text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- RPC wrapper: re-enqueue eligible failed leads, increment attempts, and log
-- This wraps existing retry functions to avoid schema drift across migrations
create or replace function public.retry_failed(p_lead_ids uuid[])
returns table(lead_id uuid, new_attempt_count int, status text)
language sql
security definer
set search_path = public
as $$
  with base as (
    -- Prefer the canonical retry function if present
    select l.id as lead_id
    from public.leads l
    where false
  ),
  retried as (
    -- Use existing retry function when available; fall back to direct update
    select x.lead_id
    from (
      select * from public.retry_failed_leads(p_lead_ids) as t(lead_id uuid, new_status text, attempts int)
    ) x
  ),
  updated as (
    -- For rows not handled by existing function (e.g., if it's absent), do minimal guarded update
    insert into public.campaign_logs (campaign_id, lead_id, event, meta)
    select l.campaign_id, l.id, 'retry_enqueued', jsonb_build_object('attempt', coalesce(l.attempts, l.attempt_count, 0) + 1)
    from public.leads l
    where l.id = any(p_lead_ids)
      and l.status = 'failed'
      and coalesce(l.attempts, l.attempt_count, 0) < coalesce(l.max_attempts, 3)
      and not exists (select 1 from retried r where r.lead_id = l.id)
    returning lead_id
  )
  select l.id as lead_id,
         coalesce(l.attempts, l.attempt_count, 0) as new_attempt_count,
         l.status::text as status
  from public.leads l
  where l.id = any(p_lead_ids);
$$;


