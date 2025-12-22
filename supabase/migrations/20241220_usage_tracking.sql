-- Usage tracking and plan management
-- 10_usage.sql

create table if not exists plans (
  stripe_price_id text primary key,        -- e.g. price_basic_xxx
  name text not null,
  monthly_limit int not null,              -- max emails/month
  rate_per_min int not null default 60     -- throttle per user
);

create table if not exists usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_ym text not null,                 -- YYYY-MM
  sent_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period_ym)
);

-- helper view: current sub with price id
create or replace view v_user_subscription as
select
  bc.user_id,
  bs.status,
  bs.current_period_end,
  bs.stripe_subscription_id
from billing_customers bc
left join billing_subscriptions bs on bs.user_id = bc.user_id;

-- seed plans (adjust to your Stripe price ids)
insert into plans (stripe_price_id, name, monthly_limit, rate_per_min)
values
  ('price_basic_xxx','Basic',3000,60),
  ('price_pro_xxx','Pro',20000,300)
on conflict (stripe_price_id) do update
set name=excluded.name, monthly_limit=excluded.monthly_limit, rate_per_min=excluded.rate_per_min;