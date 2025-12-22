-- Plan limits (extend existing), activity index, and sends_used RPC

-- 1) Extend plan_limits with monthly cap if needed
do $$ begin
  alter table public.plan_limits add column if not exists monthly_send_cap int not null default 1000;
exception when undefined_table then null; end $$;

-- Seed/update monthly caps for known plans if table exists
do $$ begin
  update public.plan_limits set monthly_send_cap = 1000 where plan::text = 'free';
  update public.plan_limits set monthly_send_cap = 10000 where plan::text = 'starter';
  update public.plan_limits set monthly_send_cap = 50000 where plan::text = 'pro';
exception when undefined_table then null; end $$;

-- 2) Optional Stripe-price keyed table (only if not present already)
create table if not exists public.plan_limits_prices (
  plan_id text primary key,               -- Stripe price id (e.g., price_123)
  daily_send_cap int not null,
  monthly_send_cap int not null
);

-- Example seed for price-based (won't conflict with enum plans)
insert into public.plan_limits_prices (plan_id, daily_send_cap, monthly_send_cap)
values ('price_free', 50, 1000)
on conflict (plan_id) do nothing;

-- 3) Index for logs by campaign/date
create index if not exists idx_logs_campaign_created on public.campaign_logs(campaign_id, created_at);

-- 4) RPC to compute sends used over a window (by campaign)
create or replace function public.sends_used(p_campaign_id uuid, p_days int)
returns int
language sql
security definer
as $$
  select count(*)::int
  from public.campaign_logs
  where campaign_id = p_campaign_id
    and type = 'sent'
    and created_at >= now() - (p_days || ' days')::interval;
$$;

revoke all on function public.sends_used(uuid,int) from public;
grant execute on function public.sends_used(uuid,int) to anon, authenticated, service_role;


