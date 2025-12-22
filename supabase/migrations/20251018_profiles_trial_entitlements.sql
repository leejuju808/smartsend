-- Extend profiles for trial + entitlements
alter table public.profiles
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_used boolean default false;

-- View to centralize entitlement logic
-- Rules:
--  - 'active' or 'trialing' with trial_ends_at > now() => entitled=true
--  - if trial expired => entitled=false
--  - if trial expired but status='active' => entitled=true (paid wins)
create or replace view public.v_entitlements as
select
  p.id as user_id,
  p.email,
  p.subscription_status,
  p.trial_started_at,
  p.trial_ends_at,
  p.trial_used,
  case
    when p.subscription_status in ('active') then true
    when p.subscription_status in ('trialing') and (p.trial_ends_at is null or p.trial_ends_at > now()) then true
    else false
  end as entitled,
  case
    when p.trial_ends_at is not null and p.trial_ends_at <= now() then true
    else false
  end as trial_expired
from public.profiles p;

comment on view public.v_entitlements is 'Resolved entitlement: paid or in-active trial => entitled';

-- RLS: profiles already enabled; expose view read to authenticated
grant select on public.v_entitlements to authenticated;
