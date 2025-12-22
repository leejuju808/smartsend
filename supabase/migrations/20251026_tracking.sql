-- Per-log engagement fields
alter table if exists public.campaign_logs
  add column if not exists open_count int default 0,
  add column if not exists click_count int default 0,
  add column if not exists first_open_at timestamptz,
  add column if not exists last_open_at timestamptz,
  add column if not exists first_click_at timestamptz,
  add column if not exists last_click_at timestamptz,
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_logs_last_open on public.campaign_logs (last_open_at desc);
create index if not exists idx_logs_last_click on public.campaign_logs (last_click_at desc);

-- Ensure campaign_events table exists
create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid,
  lead_id uuid,
  log_id uuid references public.campaign_logs(id) on delete cascade,
  event_type text not null,
  meta jsonb,
  created_at timestamptz default now()
);

-- Fast lookup from events (created earlier)
create index if not exists idx_events_type_time on public.campaign_events (event_type, created_at desc);
create index if not exists idx_events_log_id on public.campaign_events (log_id);

-- Atomic bumpers to avoid race conditions
create or replace function public.bump_open(p_log_id uuid, p_now timestamptz)
returns void
language plpgsql
security definer
as $$
begin
  update public.campaign_logs
     set open_count   = coalesce(open_count,0) + 1,
         first_open_at = coalesce(first_open_at, p_now),
         last_open_at  = p_now,
         updated_at    = coalesce(p_now, now())
   where id = p_log_id;
end;
$$;

create or replace function public.bump_click(p_log_id uuid, p_now timestamptz)
returns void
language plpgsql
security definer
as $$
begin
  update public.campaign_logs
     set click_count    = coalesce(click_count,0) + 1,
         first_click_at = coalesce(first_click_at, p_now),
         last_click_at  = p_now,
         updated_at     = coalesce(p_now, now())
   where id = p_log_id;
end;
$$;

revoke all on function public.bump_open(uuid, timestamptz)  from public;
revoke all on function public.bump_click(uuid, timestamptz) from public;
grant execute on function public.bump_open(uuid, timestamptz)  to service_role;
grant execute on function public.bump_click(uuid, timestamptz) to service_role;