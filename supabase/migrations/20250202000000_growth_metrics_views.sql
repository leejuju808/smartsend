-- Growth Metrics Dashboard Views
-- Provides real-time analytics for users, MRR, referrals, activation, and email activity

-- Active Users: users who logged in this week
create or replace view active_users as
select
  count(distinct user_id) as active_users
from auth.sessions
where created_at > now() - interval '7 days';

-- Onboarding Stats: activation rate calculation
-- Consider users activated if they've completed at least one onboarding step
create or replace view onboarding_stats as
select
  count(distinct user_id) filter (where completed) as completed,
  (select count(distinct id) from auth.users) as total,
  round(
    count(distinct user_id) filter (where completed)::numeric /
    nullif((select count(distinct id) from auth.users), 0) * 100, 2
  ) as activation_rate
from onboarding_progress;

-- Referral Stats: total invited / activated
create or replace view referral_stats as
select
  count(*) filter (where status = 'activated') as activated_referrals,
  count(*) as total_referrals
from referrals;

-- Email Activity: total sends this month
create or replace view email_activity as
select
  count(*) filter (where direction = 'outbound') as sent_this_month
from messages
where sent_at > date_trunc('month', now());

-- Grant access to authenticated users (views are read-only by default)
grant select on active_users to authenticated;
grant select on onboarding_stats to authenticated;
grant select on referral_stats to authenticated;
grant select on email_activity to authenticated;

