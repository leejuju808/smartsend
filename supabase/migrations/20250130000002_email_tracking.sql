-- Block 109: Open/Click Tracking (Pixel + Redirector)
-- Creates email_events and tracking_links tables with RLS and indexes

-- 1) Events table (opens/clicks/bounces later)
create table if not exists public.email_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  send_id uuid references public.campaign_sends(id) on delete set null,
  email_id uuid references public.emails(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  kind text not null check (kind in ('open','click')),
  user_agent text,
  ip inet,
  url text,          -- for clicks
  meta jsonb
);

-- 2) Map short tokens -> destination URLs
create table if not exists public.tracking_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  send_id uuid references public.campaign_sends(id) on delete set null,
  email_id uuid references public.emails(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  token text not null unique,      -- short code used in redirect
  dest_url text not null           -- original destination
);

-- 3) Quick filters
create index if not exists email_events_account_kind on public.email_events(account_id, kind, created_at desc);
create index if not exists tracking_links_token on public.tracking_links(token);

-- 4) RLS
alter table public.email_events enable row level security;
alter table public.tracking_links enable row level security;

create policy "acct can see its events"
  on public.email_events for select
  using (account_id = auth.uid());

create policy "service role can insert events"
  on public.email_events for insert
  with check (auth.role() = 'service_role');

create policy "acct can manage its tracking links"
  on public.tracking_links
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

-- 5) Optional per-account setting to disable tracking
alter table public.accounts add column if not exists tracking_enabled boolean not null default true;

-- 6) RPC function for counting events
create or replace function public.count_events(p_campaign_id uuid, p_kind text)
returns table(count bigint) language sql stable as $$
  select count(*)::bigint
  from public.email_events
  where campaign_id = p_campaign_id and kind = p_kind;
$$;

grant execute on function public.count_events(uuid, text) to authenticated;

