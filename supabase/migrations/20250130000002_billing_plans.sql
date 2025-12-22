-- Block 385 — DB-Driven Plan Caps v1
-- Plan caps stored in DB instead of hardcoded in code

create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null unique, -- e.g. 'free', 'starter', 'pro'
  stripe_price_id text,          -- optional: link to Stripe price
  seat_limit integer not null,
  daily_send_cap integer not null,
  monthly_send_cap integer not null,
  monthly_reply_cap integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_billing_plans_plan_key
  on public.billing_plans (plan_key);

-- Simple trigger to keep updated_at fresh
create or replace function public.set_billing_plans_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_billing_plans_updated_at on public.billing_plans;

create trigger trg_billing_plans_updated_at
before update on public.billing_plans
for each row execute function public.set_billing_plans_updated_at();

-- Seed default plans (adjust numbers as you like)
insert into public.billing_plans (plan_key, seat_limit, daily_send_cap, monthly_send_cap, monthly_reply_cap)
values
  ('free',    1,   200,   3000,   300),
  ('starter', 3,   500,  10000,  1500),
  ('pro',    10,  2000,  60000,  6000)
on conflict (plan_key) do update set
  seat_limit = excluded.seat_limit,
  daily_send_cap = excluded.daily_send_cap,
  monthly_send_cap = excluded.monthly_send_cap,
  monthly_reply_cap = excluded.monthly_reply_cap;





