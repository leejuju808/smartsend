-- Block 181: Global Deliverability Guardrail Engine
-- Creates deliverability_stats table for tracking bounce buffer, unsubscribe shield, and domain reputation

create table if not exists public.deliverability_stats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  account_id uuid not null,
  domain text not null,

  sent_24h int default 0,
  bounces_24h int default 0,
  complaints_24h int default 0,
  unsubscribes_24h int default 0,

  reputation_score int default 100,

  -- Ensure one row per account+domain combination
  unique(account_id, domain)
);

-- Indexes for fast lookups
create index if not exists idx_deliv_account on public.deliverability_stats(account_id);
create index if not exists idx_deliv_domain on public.deliverability_stats(domain);
create index if not exists idx_deliv_reputation on public.deliverability_stats(reputation_score);
create index if not exists idx_deliv_updated on public.deliverability_stats(updated_at);

-- Update timestamp trigger
create or replace function update_deliverability_stats_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_deliverability_stats_updated_at
  before update on public.deliverability_stats
  for each row
  execute function update_deliverability_stats_updated_at();

-- Enable RLS
alter table public.deliverability_stats enable row level security;

-- RLS policies
create policy "service_role_manages_deliverability_stats" on public.deliverability_stats
  for all to service_role using (true) with check (true);

create policy "authenticated_read_own_deliverability_stats" on public.deliverability_stats
  for select to authenticated using (
    account_id in (
      select id from public.workspaces where user_id = auth.uid()
      union
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

-- Function to reset 24h counters (called by cron)
create or replace function reset_24h_counters()
returns void as $$
begin
  update public.deliverability_stats
  set 
    sent_24h = 0,
    bounces_24h = 0,
    complaints_24h = 0,
    unsubscribes_24h = 0,
    updated_at = now()
  where updated_at < now() - interval '24 hours';
end;
$$ language plpgsql;












