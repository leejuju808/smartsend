-- Marketing Engine Automation
-- Creates marketing_posts table for scheduled content publishing

create table if not exists public.marketing_posts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('thread', 'video', 'email')),
  title text,
  content text not null,
  status text default 'draft' check (status in ('draft', 'scheduled', 'published', 'failed')),
  publish_date timestamptz,
  metrics jsonb default '{}'::jsonb, -- likes, views, clicks, signups, retweets
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_marketing_posts_status on public.marketing_posts(status);
create index if not exists idx_marketing_posts_publish_date on public.marketing_posts(publish_date);
create index if not exists idx_marketing_posts_type on public.marketing_posts(type);
create index if not exists idx_marketing_posts_status_publish_date on public.marketing_posts(status, publish_date);

-- RLS policies (allow authenticated users to manage their own posts)
alter table public.marketing_posts enable row level security;

create policy "Users can view all marketing posts"
  on public.marketing_posts for select
  using (true);

create policy "Service role can manage marketing posts"
  on public.marketing_posts for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');

-- Function to update updated_at timestamp
create or replace function update_marketing_posts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_marketing_posts_updated_at
  before update on public.marketing_posts
  for each row
  execute function update_marketing_posts_updated_at();

-- Function to get marketing performance metrics
create or replace function get_marketing_performance()
returns table (
  type text,
  avg_clicks numeric,
  avg_signups numeric,
  total_posts bigint,
  avg_likes numeric,
  avg_retweets numeric
) as $$
begin
  return query
  select
    mp.type,
    avg((mp.metrics->>'clicks')::numeric) as avg_clicks,
    avg((mp.metrics->>'signups')::numeric) as avg_signups,
    count(*)::bigint as total_posts,
    avg((mp.metrics->>'likes')::numeric) as avg_likes,
    avg((mp.metrics->>'retweets')::numeric) as avg_retweets
  from public.marketing_posts mp
  where mp.status = 'published'
  group by mp.type
  order by mp.type;
end;
$$ language plpgsql security definer;

comment on table public.marketing_posts is 'Stores marketing content (threads, videos, emails) with scheduling and metrics';
comment on function get_marketing_performance() is 'Returns aggregated performance metrics by post type';

