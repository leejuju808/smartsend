-- Creator profiles (one per auth user)
create table if not exists public.marketplace_creators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null,
  bio text,
  website text,
  stripe_account_id text,                 -- Stripe Connect account
  rev_share_bps int not null default 500, -- 500 = 5%
  status text not null default 'pending' check (status in ('pending','approved','rejected','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Template ownership (who authored the template)
alter table public.marketplace_templates
  add column if not exists creator_id uuid references public.marketplace_creators(id) on delete set null,
  add column if not exists version int not null default 1;

-- Reviews/ratings
create table if not exists public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.marketplace_templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  title text,
  body text,
  created_at timestamptz not null default now(),
  unique(template_id, user_id)
);

create index if not exists idx_reviews_template on public.marketplace_reviews(template_id);
create index if not exists idx_reviews_user on public.marketplace_reviews(user_id);

-- Payout ledger (what we owe creators)
create table if not exists public.marketplace_payout_ledger (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.marketplace_creators(id) on delete cascade,
  template_id uuid not null references public.marketplace_templates(id) on delete cascade,
  purchase_id uuid not null references public.marketplace_purchases(id) on delete cascade,
  amount_cents int not null,    -- creator share for this transaction
  status text not null default 'accrued' check (status in ('accrued','queued','paid','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Speed + RLS
alter table public.marketplace_creators enable row level security;
create policy "creator self-view" on public.marketplace_creators
  for select using (auth.uid() = user_id);
create policy "admin can manage creators" on public.marketplace_creators
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

alter table public.marketplace_reviews enable row level security;
create policy "reviews visible" on public.marketplace_reviews for select using (true);
create policy "reviews by owner" on public.marketplace_reviews for insert with check (auth.uid() = user_id);

alter table public.marketplace_payout_ledger enable row level security;
create policy "creator can see own ledger" on public.marketplace_payout_ledger
  for select using (exists (
    select 1 from public.marketplace_creators c
    where c.id = creator_id and c.user_id = auth.uid()
  )); 