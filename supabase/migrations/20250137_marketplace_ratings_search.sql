-- Marketplace Ratings + Search Enhancement
-- Run this after the basic marketplace is working

-- A) Ratings table (1-5 stars)
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

-- B) Lightweight analytics: installs counter materialized view
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

-- C) pg_trgm for fuzzy search (if not already enabled)
create extension if not exists pg_trgm;
create index if not exists idx_marketplace_templates_name_trgm on public.marketplace_templates using gin (name gin_trgm_ops);
create index if not exists idx_marketplace_templates_description_trgm on public.marketplace_templates using gin (description gin_trgm_ops);

-- D) Update the marketplace_templates table to sync with stats view
-- This ensures the rating and installs columns stay in sync
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