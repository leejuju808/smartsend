-- Send settings and usage tracking for rate limiting

-- Per-workspace sending limits
create table if not exists public.send_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  hourly_cap int not null default 50,   -- safe default
  daily_cap  int not null default 200,  -- safe default
  jitter_ms_min int not null default 500,  -- min delay between sends
  jitter_ms_max int not null default 2500, -- max delay between sends
  updated_at timestamptz not null default now()
);

-- Usage buckets (UTC day/hour)
create table if not exists public.send_usage (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ymd date not null,
  hour int not null,               -- 0..23
  count int not null default 0,
  primary key (workspace_id, ymd, hour)
);

-- Index for querying current hour/day usage
create index if not exists idx_send_usage_lookup 
  on public.send_usage(workspace_id, ymd desc, hour desc);

-- Atomic increment for send_usage (called before sending)
create or replace function public.increment_send_usage(
  p_workspace_id uuid,
  p_ymd date,
  p_hour int,
  p_n int
) returns void language plpgsql as $$
begin
  -- insert or update the counter
  insert into public.send_usage (workspace_id, ymd, hour, count)
    values (p_workspace_id, p_ymd, p_hour, p_n)
    on conflict (workspace_id, ymd, hour)
    do update set count = send_usage.count + p_n;
end $$;

-- Helper function to get current usage counts
create or replace function public.get_send_usage_counts(
  p_workspace_id uuid,
  p_ymd date,
  p_hour int
) returns table (
  hour_count int,
  day_count bigint
) language plpgsql as $$
begin
  return query
  select 
    coalesce((select count from public.send_usage where workspace_id = p_workspace_id and ymd = p_ymd and hour = p_hour), 0)::int as hour_count,
    coalesce((select sum(count) from public.send_usage where workspace_id = p_workspace_id and ymd = p_ymd), 0)::bigint as day_count;
end $$;
