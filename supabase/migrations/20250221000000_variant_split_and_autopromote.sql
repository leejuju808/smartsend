-- Fixed % allocation across versions + auto-promote
-- Per-variant traffic split across versions (weights sum to 100)

create table if not exists public.variant_split (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  variant_key text not null,
  template_version_id uuid not null references public.template_versions(id) on delete cascade,
  weight int not null check (weight >= 0 and weight <= 100),
  unique (campaign_id, variant_key, template_version_id)
);

-- Toggle auto-promote & guardrails
alter table public.campaigns
  add column if not exists ab_autopromote boolean not null default false,
  add column if not exists ab_min_samples int not null default 100,         -- min sends per version
  add column if not exists ab_promotion_delta real not null default 0.02;   -- +2% reply rate

-- Indexes for performance
create index if not exists idx_variant_split_campaign_variant on public.variant_split(campaign_id, variant_key);
create index if not exists idx_variant_split_version on public.variant_split(template_version_id);

-- RLS for variant_split
alter table public.variant_split enable row level security;

-- Users can read splits for campaigns they have access to
create policy "variant_split_read" on public.variant_split
  for select
  using (
    exists (
      select 1 from public.v_campaign_access v
      where v.campaign_id = variant_split.campaign_id
    )
  );

-- Users with canSend can write splits
create policy "variant_split_write" on public.variant_split
  for all
  using (
    exists (
      select 1 from public.v_campaign_access v
      where v.campaign_id = variant_split.campaign_id
      and v.role in ('admin', 'sender')
    )
  )
  with check (
    exists (
      select 1 from public.v_campaign_access v
      where v.campaign_id = variant_split.campaign_id
      and v.role in ('admin', 'sender')
    )
  );

