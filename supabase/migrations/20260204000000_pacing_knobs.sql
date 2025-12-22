-- Pacing knobs and lightweight counters
-- Campaign-level pacing defaults (can be overridden per variant later)

alter table public.campaigns
  add column if not exists variant_hourly_cap int not null default 200; -- per-variant max/hour

-- Optional: overall campaign cap
alter table public.campaigns
  add column if not exists campaign_hourly_cap int not null default 1000;

-- (Optional) per-variant overrides table
create table if not exists public.variant_pacing (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  variant_key text not null,
  hourly_cap int not null,
  unique (campaign_id, variant_key)
);

-- Fast lookups
create index if not exists idx_variant_pacing on public.variant_pacing(campaign_id, variant_key);

-- Sent logs already exist; add an index used for 60m window count:
-- Note: Assumes send_logs has campaign_id, variant_key, and sent_at columns
create index if not exists idx_sent_logs_campaign_variant_hour
  on public.send_logs(campaign_id, variant_key, sent_at desc)
  where sent_at is not null;

create index if not exists idx_send_logs_campaign_hour
  on public.send_logs(campaign_id, sent_at desc)
  where sent_at is not null;

-- Ensure send_logs has variant_key if it doesn't already (from ab_testing migration)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'send_logs' 
    and column_name = 'variant_key'
  ) then
    alter table public.send_logs add column variant_key text;
  end if;
end $$;

-- RLS for variant_pacing
alter table public.variant_pacing enable row level security;

-- Users can read/write variant_pacing for campaigns they can access
-- (Assuming there's a v_campaign_access view or similar)
create policy "variant_pacing_select_own"
  on public.variant_pacing
  for select
  using (
    exists (
      select 1 from public.v_campaign_access vca
      where vca.campaign_id = variant_pacing.campaign_id
      and vca.user_id = auth.uid()
    )
  );

create policy "variant_pacing_insert_own"
  on public.variant_pacing
  for insert
  with check (
    exists (
      select 1 from public.v_campaign_access vca
      where vca.campaign_id = variant_pacing.campaign_id
      and vca.user_id = auth.uid()
      and vca.role in ('admin', 'sender')
    )
  );

create policy "variant_pacing_update_own"
  on public.variant_pacing
  for update
  using (
    exists (
      select 1 from public.v_campaign_access vca
      where vca.campaign_id = variant_pacing.campaign_id
      and vca.user_id = auth.uid()
      and vca.role in ('admin', 'sender')
    )
  );

create policy "variant_pacing_delete_own"
  on public.variant_pacing
  for delete
  using (
    exists (
      select 1 from public.v_campaign_access vca
      where vca.campaign_id = variant_pacing.campaign_id
      and vca.user_id = auth.uid()
      and vca.role in ('admin', 'sender')
    )
  );

