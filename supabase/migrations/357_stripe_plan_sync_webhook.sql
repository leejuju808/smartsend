-- Block 357: Stripe → Plan Sync Webhook v1
-- Populate billing_plans.stripe_price_id with Stripe price IDs
-- NOTE: Update these with your actual Stripe price IDs from your Stripe dashboard

-- Update existing plans with stripe_price_id
-- Replace 'price_123_free', 'price_123_starter', 'price_123_growth' with your actual Stripe price IDs
update billing_plans
set stripe_price_id = 'price_123_free'
where id = 'free'
  and stripe_price_id is null;

update billing_plans
set stripe_price_id = 'price_123_starter'
where id = 'starter'
  and stripe_price_id is null;

update billing_plans
set stripe_price_id = 'price_123_growth'
where id = 'growth'
  and stripe_price_id is null;

-- You can also insert new plan rows with stripe_price_id from the start
-- Example:
-- insert into billing_plans (id, name, description, stripe_price_id, daily_send_cap, daily_reply_cap, seat_limit)
-- values ('scale', 'Scale', 'For large teams', 'price_123_scale', 10000, 2000, 20)
-- on conflict (id) do update
-- set stripe_price_id = excluded.stripe_price_id;





