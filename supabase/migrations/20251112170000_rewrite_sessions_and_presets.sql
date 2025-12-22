create table if not exists public.rewrite_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  step_id uuid references public.campaign_steps(id) on delete set null,
  source_subject text not null,
  source_body text not null,
  controls jsonb not null,
  output_subject text not null,
  output_body text not null,
  model text not null default 'gpt-4o-mini',
  tokens int,
  latency_ms int
);

create index if not exists idx_rewrite_sessions_campaign on public.rewrite_sessions(campaign_id, created_at desc);

create table if not exists public.rewrite_presets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  controls jsonb not null,
  unique(account_id, name)
);




