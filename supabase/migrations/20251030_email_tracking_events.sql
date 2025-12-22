-- New simpler tracking schema for lead engagement
-- Note: This creates NEW tables separate from existing tracking infrastructure

-- Opaque token per (workspace,campaign,lead) send
create table if not exists public.lead_tracking_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists lead_tracking_tokens_lead_idx on public.lead_tracking_tokens(lead_id);
create index if not exists lead_tracking_tokens_workspace_idx on public.lead_tracking_tokens(workspace_id, campaign_id, lead_id);

-- Events: open / click
create table if not exists public.lead_email_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid not null,
  token_id uuid not null references public.lead_tracking_tokens(id) on delete cascade,
  type text not null check (type in ('open','click')),
  url text,
  ua text,
  ip inet,
  created_at timestamptz not null default now()
);

create index if not exists lead_email_events_lead_idx on public.lead_email_events(lead_id, type);
create index if not exists lead_email_events_token_idx on public.lead_email_events(token_id);

-- Fast per-lead aggregates
create or replace view public.v_lead_engagement as
select
  lead_id,
  sum(case when type='open' then 1 else 0 end)::int as opens,
  sum(case when type='click' then 1 else 0 end)::int as clicks
from public.lead_email_events
group by lead_id;

-- RPC to fetch counts for a batch of leads
create or replace function public.lead_engagement_counts(p_lead_ids uuid[])
returns table (lead_id uuid, opens int, clicks int)
language sql
stable
as $$
  select l.lead_id, l.opens, l.clicks
  from public.v_lead_engagement l
  where l.lead_id = any(p_lead_ids)
$$;

grant select on public.v_lead_engagement to anon, authenticated, service_role;
grant execute on function public.lead_engagement_counts(uuid[]) to anon, authenticated, service_role;

