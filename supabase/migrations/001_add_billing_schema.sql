-- Extend profiles with plan + usage
alter table public.profiles
  add column if not exists plan text default 'free',
  add column if not exists monthly_sends int default 0,
  add column if not exists last_reset timestamptz default now();

-- Optionally tie Stripe subscription id
alter table public.profiles
  add column if not exists stripe_subscription_id text;

-- Function to reset monthly sends
create or replace function public.reset_monthly_sends()
returns void as $$
begin
  update public.profiles
  set monthly_sends = 0, last_reset = now()
  where date_part('month', last_reset) <> date_part('month', now());
end;
$$ language plpgsql;

-- Function to increment monthly sends
create or replace function public.increment_monthly_sends(email text)
returns void as $$
begin
  update public.profiles
  set monthly_sends = monthly_sends + 1
  where profiles.email = increment_monthly_sends.email;
end;
$$ language plpgsql; 