-- Seed plans

insert into public.plans (id, name, stripe_price_id, monthly_quota_emails, max_seats, sort) values
('free','Free', null, 200, 1, 1)
on conflict (id) do nothing;

-- Replace price IDs with yours from Stripe

insert into public.plans (id, name, stripe_price_id, monthly_quota_emails, max_seats, sort) values
('pro','Pro', 'price_PRO_MONTHLY', 5000, 3, 2)
on conflict (id) do nothing;

insert into public.plans (id, name, stripe_price_id, monthly_quota_emails, max_seats, sort) values
('team','Team', 'price_TEAM_MONTHLY', 20000, 10, 3)
on conflict (id) do nothing;

