-- Marketplace Monetization Schema
-- Adds premium templates, entitlements, purchases, and creator payout support

-- Templates table must already exist; add pricing/flags
alter table public.marketplace_templates
  add column if not exists is_premium boolean not null default false,
  add column if not exists stripe_price_id text,
  add column if not exists price_cents int generated always as (coalesce( (regexp_replace(stripe_price_id, '\D', '', 'g'))::int, 0)) stored;

-- Entitlements (who owns which premium template)
create table if not exists public.marketplace_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.marketplace_templates(id) on delete cascade,
  source text not null check (source in ('purchase','grant','refund')),
  created_at timestamptz not null default now(),
  unique(user_id, template_id)
);

-- Purchases
create table if not exists public.marketplace_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.marketplace_templates(id) on delete cascade,
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text unique,
  amount_cents int not null,
  status text not null check (status in ('requires_payment','succeeded','refunded','canceled')),
  created_at timestamptz not null default now()
);

-- Creators (optional, for rev share later)
create table if not exists public.marketplace_creators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  display_name text,
  stripe_account_id text,
  created_at timestamptz not null default now()
);

-- Performance helpers
create index if not exists idx_entitlements_user on public.marketplace_entitlements(user_id);
create index if not exists idx_purchases_user on public.marketplace_purchases(user_id);
create index if not exists idx_templates_premium on public.marketplace_templates(is_premium);

-- RLS (if RLS is on)
alter table public.marketplace_entitlements enable row level security;
create policy "entitlements are visible to owner"
  on public.marketplace_entitlements for select
  using (auth.uid() = user_id);

alter table public.marketplace_purchases enable row level security;
create policy "purchases visible to owner"
  on public.marketplace_purchases for select
  using (auth.uid() = user_id);

-- Service role can insert for webhooks
create policy "service can insert entitlements"
  on public.marketplace_entitlements for insert
  with check (true);

create policy "service can insert purchases"
  on public.marketplace_purchases for insert
  with check (true); 