create table if not exists public.churn_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  reason text,
  offer_applied boolean default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_churn_intents_user_time
on public.churn_intents (user_id, created_at desc);
