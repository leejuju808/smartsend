++ supabase/migrations/20251108120000_tracking_links_events.sql
-- Tracking links and events tables with RLS

create table if not exists public.tracking_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  outbox_id uuid not null references public.outbox_requests(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  message_id uuid,
  token text not null unique,
  original_url text not null,
  short_url text
);

create index if not exists idx_tlinks_outbox on public.tracking_links(outbox_id);
create index if not exists idx_tlinks_thread on public.tracking_links(thread_id);

create type if not exists public.track_event_kind as enum ('opened', 'clicked');

create table if not exists public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind public.track_event_kind not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  outbox_id uuid references public.outbox_requests(id) on delete set null,
  message_id uuid,
  link_id uuid references public.tracking_links(id) on delete set null,
  ua text,
  ip inet,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_te_campaign_kind on public.tracking_events(campaign_id, kind);
create index if not exists idx_te_outbox on public.tracking_events(outbox_id);

alter table public.tracking_links enable row level security;
alter table public.tracking_events enable row level security;

drop policy if exists "tlinks_read" on public.tracking_links;
create policy "tlinks_read" on public.tracking_links
  for select to authenticated
  using (public.is_campaign_viewer(campaign_id));

drop policy if exists "tevents_read" on public.tracking_events;
create policy "tevents_read" on public.tracking_events
  for select to authenticated
  using (public.is_campaign_viewer(campaign_id));

drop policy if exists "tlinks_block_writes" on public.tracking_links;
create policy "tlinks_block_writes" on public.tracking_links
  for all to authenticated using (false) with check (false);

drop policy if exists "tevents_block_writes" on public.tracking_events;
create policy "tevents_block_writes" on public.tracking_events
  for all to authenticated using (false) with check (false);

create or replace view public.v_tracking_counts as
select
  t.thread_id,
  count(*) filter (where e.kind = 'opened') as opens,
  count(*) filter (where e.kind = 'clicked') as clicks
from public.tracking_events e
join public.outbox_requests t on t.id = e.outbox_id
group by 1;




