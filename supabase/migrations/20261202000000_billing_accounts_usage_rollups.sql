-- Billing Accounts + Usage Rollups
-- One billing account per SmartSend owner (map auth.users -> Stripe)

create table if not exists public.billing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,                 -- metered price (per-email)
  plan_code text,                       -- e.g. 'starter','pro'
  monthly_quota int default 1000,       -- included sends per month
  overage_cents int default 1,          -- e.g. $0.01 per extra email (optional display)
  period_start date,                    -- current billing period start (UTC date)
  period_end   date,                    -- current billing period end   (UTC date)
  usage_mtd int default 0,              -- emails sent this period
  updated_at timestamptz default now()
);

create index if not exists idx_billing_sub on public.billing_accounts(stripe_subscription_id);

-- Helper: (re)start period (called from webhook on subscription cycle changes)
create or replace function public.billing_set_period(
  p_user uuid, p_start timestamptz, p_end timestamptz
) returns void language sql as $$
  update public.billing_accounts
     set period_start = (p_start at time zone 'utc')::date,
         period_end   = (p_end   at time zone 'utc')::date,
         usage_mtd    = 0,
         updated_at   = now()
   where user_id = p_user;
$$;

-- Helper: increment usage (atomic) — service role only
create or replace function public.billing_add_usage(p_user uuid, p_qty int)
returns int
language plpgsql
security definer
as $$
declare v_total int;
begin
  update public.billing_accounts
     set usage_mtd = usage_mtd + p_qty,
         updated_at = now()
   where user_id = p_user
   returning usage_mtd into v_total;
  return v_total;
end;
$$;

revoke all on function public.billing_add_usage(uuid,int) from public;
grant execute on function public.billing_add_usage(uuid,int) to service_role;

-- Helper: remaining allowance for this period
create or replace function public.plan_remaining(p_user uuid)
returns int language sql stable as $$
  select greatest(0, coalesce(monthly_quota,0) - coalesce(usage_mtd,0))
  from public.billing_accounts where user_id = p_user;
$$;

-- RLS policies
alter table public.billing_accounts enable row level security;

create policy "Users can view their own billing account"
  on public.billing_accounts for select
  using (auth.uid() = user_id);

