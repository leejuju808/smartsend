-- Block 97 — Saved View Builder
-- Provides deterministic RPC helpers for building inbox/lead saved views.

-- 1) Run filters for INBOX scope (threads + scores)
create or replace function public.rpc_run_view_inbox(
  p_account_id uuid,
  p_filters jsonb default '{}'::jsonb,
  p_limit int default 200
) returns setof record
language sql
stable
as $$
  with base as (
    select
      t.*,
      s.score,
      s.last_at,
      s.has_meeting
    from public.threads t
    join public.v_lead_reply_scores s on s.thread_id = t.id
    join public.leads l on l.id = t.lead_id
    where t.account_id = p_account_id
      and (
        coalesce(p_filters->>'intent', '') = '' or
        exists (
          select 1
          from public.messages m
          where m.thread_id = t.id
            and m.direction = 'inbound'
            and m.label = (p_filters->>'intent')
        )
      )
      and (
        (p_filters->>'since_days') is null
        or s.last_at >= now() - ((p_filters->>'since_days')::int || ' days')::interval
      )
      and (
        (p_filters->>'score_min') is null
        or s.score >= (p_filters->>'score_min')::int
      )
      and (
        coalesce(p_filters->>'tech', '') = '' or
        (l.tech_stack ? (p_filters->>'tech'))
      )
      and (
        (p_filters->>'employees_min') is null
        or coalesce(l.employee_count, 0) >= (p_filters->>'employees_min')::int
      )
      and (
        coalesce(p_filters->>'industry_contains', '') = '' or
        coalesce(l.industry, '') ilike ('%' || (p_filters->>'industry_contains') || '%')
      )
      and (
        (p_filters->>'domain') is null
        or lower(split_part(l.email, '@', 2)) = lower(p_filters->>'domain')
      )
      and (
        (p_filters->>'paused') is null
        or case
            when (p_filters->>'paused')::boolean then t.paused_until is not null
            else t.paused_until is null
          end
      )
  )
  select *
  from base
  order by has_meeting desc, score desc, last_at desc
  limit greatest(1, p_limit)
$$;


-- 2) Run filters for LEADS scope (lead directory)
create or replace function public.rpc_run_view_leads(
  p_account_id uuid,
  p_filters jsonb default '{}'::jsonb,
  p_limit int default 500
) returns setof public.leads
language sql
stable
as $$
  select *
  from public.leads l
  where l.account_id = p_account_id
    and (
      (p_filters->>'employees_min') is null
      or coalesce(l.employee_count, 0) >= (p_filters->>'employees_min')::int
    )
    and (
      coalesce(p_filters->>'tech', '') = '' or (l.tech_stack ? (p_filters->>'tech'))
    )
    and (
      coalesce(p_filters->>'industry_contains', '') = '' or
      coalesce(l.industry, '') ilike ('%' || (p_filters->>'industry_contains') || '%')
    )
    and (
      (p_filters->>'domain') is null
      or lower(split_part(l.email, '@', 2)) = lower(p_filters->>'domain')
    )
  order by coalesce(l.updated_at, l.created_at) desc
  limit greatest(1, p_limit)
$$;


-- 3) Saved views table (idempotent)
do $$
begin
  create table if not exists public.saved_views (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    account_id uuid not null references public.accounts(id) on delete cascade,
    name text not null,
    scope text not null check (scope in ('inbox', 'leads')),
    filters jsonb not null default '{}'::jsonb,
    sort jsonb not null default '{}'::jsonb
  );
exception
  when duplicate_table then
    null;
end
$$;

alter table public.saved_views enable row level security;


