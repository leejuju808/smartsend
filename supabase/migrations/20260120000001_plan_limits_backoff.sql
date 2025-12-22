-- Plan Limits Backoff Policy
-- Add retry attempts and backoff configuration to plan limits

alter table public.plan_limits
  add column if not exists max_attempts int not null default 5,
  add column if not exists backoff_base_seconds int not null default 120;  -- 2 minutes

-- Update existing plans with retry configuration
-- free: max_attempts=3, backoff_base_seconds=180
update public.plan_limits
set max_attempts = 3, backoff_base_seconds = 180
where plan = 'free';

-- starter: 5 / 120
update public.plan_limits
set max_attempts = 5, backoff_base_seconds = 120
where plan = 'starter';

-- pro: 7 / 60
update public.plan_limits
set max_attempts = 7, backoff_base_seconds = 60
where plan = 'pro';

