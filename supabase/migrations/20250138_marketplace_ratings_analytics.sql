-- Marketplace Ratings + Analytics Enhancement
-- Builds on existing marketplace_templates and marketplace_installs tables

-- A) Ratings table (1-5 stars with comments)
create table if not exists public.template_ratings (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.marketplace_templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (template_id, user_id)
);

alter table public.template_ratings enable row level security;

-- RLS policies for ratings
create policy if not exists "ratings_select_public" on public.template_ratings
  for select using (true);
create policy if not exists "ratings_insert_self" on public.template_ratings
  for insert with check (auth.uid() = user_id);
create policy if not exists "ratings_update_self" on public.template_ratings
  for update using (auth.uid() = user_id);
create policy if not exists "ratings_delete_self" on public.template_ratings
  for delete using (auth.uid() = user_id);

-- B) Analytics: installs counter materialized view
create materialized view if not exists public.mv_template_stats as
  select t.id as template_id,
         coalesce(count(i.id),0) as installs,
         coalesce(avg(r.stars)::numeric(10,2), 0) as avg_stars,
         coalesce(count(r.id),0) as ratings_count
  from public.marketplace_templates t
  left join public.marketplace_installs i on i.template_id = t.id
  left join public.template_ratings r on r.template_id = t.id
  group by t.id;

create index if not exists idx_mv_template_stats_template on public.mv_template_stats(template_id);

-- refresh helper function
create or replace function public.refresh_template_stats()
returns trigger language plpgsql as $$
begin
  refresh materialized view public.mv_template_stats;
  return null;
end;$$;

-- triggers to refresh stats after relevant writes
create or replace trigger trg_stats_after_install
  after insert or delete on public.marketplace_installs
  for each statement execute function public.refresh_template_stats();

create or replace trigger trg_stats_after_rating
  after insert or update or delete on public.template_ratings
  for each statement execute function public.refresh_template_stats();

-- C) Event logging for analytics
create table if not exists public.template_events (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.marketplace_templates(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('view','install','copy','export')),
  created_at timestamptz not null default now()
);

alter table public.template_events enable row level security;
create policy if not exists "events_insert_self" on public.template_events
  for insert with check (auth.uid() = user_id);
create policy if not exists "events_select_public" on public.template_events for select using (true);

-- D) Trending view for last 7 days
create or replace view public.v_template_trending_7d as
  with w as (
    select now() - interval '7 days' as since
  )
  select t.id as template_id,
         t.name,
         t.cover_url,
         t.is_paid,
         t.price_cents,
         t.kind,
         -- last 7d event counts
         count(e.id) filter (where e.event_type='view'   and e.created_at >= (select since from w)) as views_7d,
         count(e.id) filter (where e.event_type='install'and e.created_at >= (select since from w)) as installs_7d,
         count(e.id) filter (where e.event_type='copy'   and e.created_at >= (select since from w)) as copies_7d,
         count(e.id) filter (where e.event_type='export' and e.created_at >= (select since from w)) as exports_7d,
         -- simple score favoring intentful actions
         ( 3 * count(e.id) filter (where e.event_type='install' and e.created_at >= (select since from w))
         + 2 * count(e.id) filter (where e.event_type='copy'    and e.created_at >= (select since from w))
         + 1 * count(e.id) filter (where e.event_type='view'    and e.created_at >= (select since from w))
         )::int as trend_score
  from public.marketplace_templates t
  left join public.template_events e on e.template_id = t.id
  where t.rating >= 0  -- only published templates
  group by t.id, t.name, t.cover_url, t.is_paid, t.price_cents, t.kind;

-- E) Enhanced search indexes
create index if not exists idx_template_events_template_time on public.template_events(template_id, created_at);
create index if not exists idx_marketplace_templates_name_trgm on public.marketplace_templates using gin (name gin_trgm_ops);
create index if not exists idx_marketplace_templates_description_trgm on public.marketplace_templates using gin (description gin_trgm_ops);

-- F) Update marketplace_templates to sync with stats view
create or replace function public.sync_template_stats()
returns trigger language plpgsql as $$
begin
  -- Update the main table with latest stats
  update public.marketplace_templates 
  set rating = s.avg_stars,
      installs = s.installs
  from public.mv_template_stats s
  where s.template_id = new.template_id;
  return null;
end;$$;

-- Trigger to sync stats after ratings change
create or replace trigger trg_sync_stats_after_rating
  after insert or update or delete on public.template_ratings
  for each row execute function public.refresh_template_stats();

-- Initial refresh
refresh materialized view public.mv_template_stats; 