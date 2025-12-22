-- Revenue Growth System: Usage-Based Billing 2.0, Referrals, Agency/Reseller, Integration Marketplace
-- Target: $50K MRR by Q2 2026

-- ============================================================================
-- 1. USAGE-BASED BILLING 2.0: Stripe Metered Billing
-- ============================================================================

-- Metered items linked to Stripe subscription items
create table if not exists public.metered_billing_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stripe_subscription_id text not null,
  stripe_subscription_item_id text not null unique, -- Stripe subscription item ID
  metric_name text not null check (metric_name in ('emails_sent', 'ai_credits')),
  unit_price_cents integer not null, -- e.g., 0.3 cents per email, 2 cents per AI credit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_metered_billing_workspace_metric 
  on public.metered_billing_items(workspace_id, metric_name);

create index if not exists idx_metered_billing_subscription 
  on public.metered_billing_items(stripe_subscription_id);

-- Usage records for Stripe usage_record API
create table if not exists public.usage_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  metered_item_id uuid not null references public.metered_billing_items(id) on delete cascade,
  quantity integer not null default 1, -- number of units used
  timestamp timestamptz not null, -- when usage occurred
  stripe_usage_record_id text, -- ID from Stripe API after syncing
  synced_to_stripe boolean default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_records_workspace 
  on public.usage_records(workspace_id, timestamp desc);

create index if not exists idx_usage_records_sync 
  on public.usage_records(synced_to_stripe, created_at)
  where synced_to_stripe = false;

-- Usage credits (pre-purchased credits or included in plans)
create table if not exists public.usage_credits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  metric_name text not null check (metric_name in ('emails_sent', 'ai_credits')),
  credits integer not null default 0,
  expires_at timestamptz,
  source text check (source in ('trial', 'purchase', 'promotion', 'bonus')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_usage_credits_workspace 
  on public.usage_credits(workspace_id, metric_name);

-- RLS for metered billing
alter table public.metered_billing_items enable row level security;
alter table public.usage_records enable row level security;
alter table public.usage_credits enable row level security;

create policy "workspace_members_read_metered_items" on public.metered_billing_items
  for select using (public.is_workspace_member(workspace_id));

create policy "workspace_admins_manage_metered_items" on public.metered_billing_items
  for all using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy "service_role_manage_metered_items" on public.metered_billing_items
  for all using (auth.role() = 'service_role');

create policy "workspace_members_read_usage_records" on public.usage_records
  for select using (public.is_workspace_member(workspace_id));

create policy "service_role_manage_usage_records" on public.usage_records
  for all using (auth.role() = 'service_role');

create policy "workspace_members_read_credits" on public.usage_credits
  for select using (public.is_workspace_member(workspace_id));

create policy "service_role_manage_credits" on public.usage_credits
  for all using (auth.role() = 'service_role');

-- ============================================================================
-- 2. ENHANCED REFERRAL SYSTEM
-- ============================================================================

-- Referrals table (extends existing affiliates system)
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid references auth.users(id) on delete set null,
  referred_email text not null,
  referral_code text not null,
  status text not null check (status in ('pending', 'signed_up', 'converted', 'rewarded')) default 'pending',
  conversion_event text, -- 'subscription', 'trial_started', 'first_send'
  reward_cents integer default 0,
  reward_paid boolean default false,
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_referrals_referrer on public.referrals(referrer_id);
create index if not exists idx_referrals_code on public.referrals(referral_code);
create index if not exists idx_referrals_email on public.referrals(referred_email);

-- Referral rewards tracking
create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete cascade,
  amount_cents integer not null,
  reward_type text check (reward_type in ('signup_bonus', 'conversion_bonus', 'recurring_commission')),
  status text check (status in ('pending', 'paid', 'cancelled')) default 'pending',
  paid_at timestamptz,
  stripe_payout_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_referral_rewards_referral 
  on public.referral_rewards(referral_id);

-- RLS for referrals
alter table public.referrals enable row level security;
alter table public.referral_rewards enable row level security;

create policy "users_read_own_referrals" on public.referrals
  for select using (auth.uid() = referrer_id);

create policy "service_role_manage_referrals" on public.referrals
  for all using (auth.role() = 'service_role');

create policy "users_read_own_rewards" on public.referral_rewards
  for select using (
    referral_id in (select id from public.referrals where referrer_id = auth.uid())
  );

create policy "service_role_manage_rewards" on public.referral_rewards
  for all using (auth.role() = 'service_role');

-- ============================================================================
-- 3. AGENCY & RESELLER SYSTEM
-- ============================================================================

-- Reseller accounts (agencies that white-label SmartSend)
create table if not exists public.reseller_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  agency_admin_user_id uuid not null references auth.users(id) on delete restrict,
  tier text not null check (tier in ('partner', 'pro', 'elite')) default 'partner',
  revenue_share_percent integer not null default 20, -- 20%, 30%, or 40%
  branding_level text check (branding_level in ('powered_by', 'custom_logo', 'white_label')) default 'powered_by',
  custom_logo_url text,
  custom_domain text,
  stripe_connect_account_id text, -- Stripe Connect for payouts
  total_seats_sold integer default 0,
  active_seats integer default 0,
  total_revenue_cents bigint default 0,
  payout_cents bigint default 0,
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reseller client workspaces (customer workspaces managed by reseller)
create table if not exists public.reseller_client_workspaces (
  id uuid primary key default gen_random_uuid(),
  reseller_account_id uuid not null references public.reseller_accounts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  seats_purchased integer not null default 1,
  monthly_fee_cents integer not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text check (status in ('active', 'cancelled', 'suspended')) default 'active',
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create unique index if not exists ux_reseller_client_workspace 
  on public.reseller_client_workspaces(workspace_id);

create index if not exists idx_reseller_clients_reseller 
  on public.reseller_client_workspaces(reseller_account_id);

-- RLS for resellers
alter table public.reseller_accounts enable row level security;
alter table public.reseller_client_workspaces enable row level security;

create policy "agency_admins_read_own_reseller" on public.reseller_accounts
  for select using (auth.uid() = agency_admin_user_id);

create policy "service_role_manage_resellers" on public.reseller_accounts
  for all using (auth.role() = 'service_role');

create policy "workspace_read_reseller_info" on public.reseller_client_workspaces
  for select using (public.is_workspace_member(workspace_id));

create policy "service_role_manage_reseller_clients" on public.reseller_client_workspaces
  for all using (auth.role() = 'service_role');

-- ============================================================================
-- 4. INTEGRATION MARKETPLACE
-- ============================================================================

-- Integration connectors (HubSpot, Slack, Pipedrive, etc.)
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  service_name text not null unique, -- 'hubspot', 'slack', 'pipedrive', 'telegram', 'notion'
  display_name text not null,
  description text,
  icon_url text,
  category text check (category in ('crm', 'communication', 'productivity', 'automation')),
  is_active boolean default true,
  config_schema jsonb, -- JSON schema for configuration
  webhook_url_template text,
  created_at timestamptz not null default now()
);

-- Integration tokens (OAuth tokens per workspace)
create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  access_token text not null, -- encrypted in production
  refresh_token text,
  token_expires_at timestamptz,
  config jsonb default '{}', -- service-specific config
  is_active boolean default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_integration_tokens_workspace_service 
  on public.integration_tokens(workspace_id, integration_id);

create index if not exists idx_integration_tokens_integration 
  on public.integration_tokens(integration_id);

-- Integration sync logs
create table if not exists public.integration_sync_logs (
  id uuid primary key default gen_random_uuid(),
  integration_token_id uuid not null references public.integration_tokens(id) on delete cascade,
  sync_type text not null, -- 'contacts', 'deals', 'messages'
  status text check (status in ('success', 'failed', 'partial')) not null,
  records_synced integer default 0,
  error_message text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_sync_logs_token 
  on public.integration_sync_logs(integration_token_id, created_at desc);

-- RLS for integrations
alter table public.integrations enable row level security;
alter table public.integration_tokens enable row level security;
alter table public.integration_sync_logs enable row level security;

create policy "public_read_active_integrations" on public.integrations
  for select using (is_active = true);

create policy "workspace_members_read_integration_tokens" on public.integration_tokens
  for select using (public.is_workspace_member(workspace_id));

create policy "workspace_admins_manage_integration_tokens" on public.integration_tokens
  for all using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy "workspace_members_read_sync_logs" on public.integration_sync_logs
  for select using (
    integration_token_id in (
      select id from public.integration_tokens 
      where workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
    )
  );

-- ============================================================================
-- 5. AI INSIGHTS HUB (Analytics & Churn Prediction)
-- ============================================================================

-- AI insights dashboard metrics
create table if not exists public.ai_insights_metrics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  metric_date date not null, -- daily snapshots
  emails_sent integer default 0,
  emails_opened integer default 0,
  emails_replied integer default 0,
  ai_rewrites_used integer default 0,
  ai_detections_used integer default 0,
  conversion_rate decimal(5,4), -- replies / sent
  reply_rate decimal(5,4), -- replies / opened
  estimated_roi_cents bigint, -- calculated from pipeline value
  churn_risk_score decimal(3,2), -- 0.0 to 1.0
  created_at timestamptz not null default now()
);

create unique index if not exists ux_ai_insights_workspace_date 
  on public.ai_insights_metrics(workspace_id, metric_date);

create index if not exists idx_ai_insights_date on public.ai_insights_metrics(metric_date desc);

-- Churn prediction events
create table if not exists public.churn_prediction_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  risk_score decimal(3,2) not null, -- 0.0 to 1.0
  risk_factors jsonb default '[]', -- array of risk factor strings
  predicted_churn_date date,
  intervention_action text, -- 'email', 'discount', 'feature_unlock'
  intervention_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_churn_prediction_workspace 
  on public.churn_prediction_events(workspace_id, created_at desc);

create index if not exists idx_churn_prediction_high_risk 
  on public.churn_prediction_events(risk_score desc, intervention_sent_at)
  where risk_score > 0.7 and intervention_sent_at is null;

-- RLS for AI insights
alter table public.ai_insights_metrics enable row level security;
alter table public.churn_prediction_events enable row level security;

create policy "workspace_members_read_insights" on public.ai_insights_metrics
  for select using (public.is_workspace_member(workspace_id));

create policy "workspace_members_read_churn_events" on public.churn_prediction_events
  for select using (public.is_workspace_member(workspace_id));

create policy "service_role_manage_insights" on public.ai_insights_metrics
  for all using (auth.role() = 'service_role');

create policy "service_role_manage_churn_events" on public.churn_prediction_events
  for all using (auth.role() = 'service_role');

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Record usage and check credits before charging
create or replace function public.record_usage_with_credits(
  p_workspace_id uuid,
  p_metric_name text,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits_remaining integer;
  v_charge_quantity integer;
  v_result jsonb;
begin
  -- Check for available credits
  select credits into v_credits_remaining
  from public.usage_credits
  where workspace_id = p_workspace_id
    and metric_name = p_metric_name
    and (expires_at is null or expires_at > now())
  order by created_at asc
  limit 1;

  if v_credits_remaining is null then
    v_credits_remaining := 0;
  end if;

  -- Use credits first, then charge
  if v_credits_remaining >= p_quantity then
    -- All covered by credits
    update public.usage_credits
    set credits = credits - p_quantity,
        updated_at = now()
    where workspace_id = p_workspace_id
      and metric_name = p_metric_name
      and (expires_at is null or expires_at > now())
    order by created_at asc
    limit 1;

    v_result := jsonb_build_object(
      'used_credits', p_quantity,
      'charged_quantity', 0,
      'credits_remaining', v_credits_remaining - p_quantity
    );
  elsif v_credits_remaining > 0 then
    -- Partially covered by credits
    v_charge_quantity := p_quantity - v_credits_remaining;
    
    update public.usage_credits
    set credits = 0,
        updated_at = now()
    where workspace_id = p_workspace_id
      and metric_name = p_metric_name
      and (expires_at is null or expires_at > now())
    order by created_at asc
    limit 1;

    -- Record chargeable usage
    insert into public.usage_records (workspace_id, metered_item_id, quantity, timestamp)
    select p_workspace_id, id, v_charge_quantity, now()
    from public.metered_billing_items
    where workspace_id = p_workspace_id
      and metric_name = p_metric_name
    limit 1;

    v_result := jsonb_build_object(
      'used_credits', v_credits_remaining,
      'charged_quantity', v_charge_quantity,
      'credits_remaining', 0
    );
  else
    -- No credits, full charge
    insert into public.usage_records (workspace_id, metered_item_id, quantity, timestamp)
    select p_workspace_id, id, p_quantity, now()
    from public.metered_billing_items
    where workspace_id = p_workspace_id
      and metric_name = p_metric_name
    limit 1;

    v_result := jsonb_build_object(
      'used_credits', 0,
      'charged_quantity', p_quantity,
      'credits_remaining', 0
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.record_usage_with_credits(uuid, text, integer) from public;
grant execute on function public.record_usage_with_credits(uuid, text, integer) to service_role, authenticated;

-- Calculate churn risk score for a workspace
create or replace function public.calculate_churn_risk(p_workspace_id uuid)
returns decimal(3,2)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_risk_score decimal(3,2) := 0.0;
  v_days_since_last_activity integer;
  v_email_send_trend decimal;
  v_subscription_status text;
  v_payment_failures integer;
begin
  -- Factor 1: Days since last email sent (0.3 weight)
  select extract(day from now() - max(created_at))::integer
  into v_days_since_last_activity
  from public.email_events
  where workspace_id = p_workspace_id;

  if v_days_since_last_activity is null or v_days_since_last_activity > 30 then
    v_risk_score := v_risk_score + 0.3;
  elsif v_days_since_last_activity > 14 then
    v_risk_score := v_risk_score + 0.15;
  end if;

  -- Factor 2: Subscription status (0.4 weight)
  select status into v_subscription_status
  from public.billing_subscriptions
  where workspace_id = p_workspace_id
  limit 1;

  if v_subscription_status = 'past_due' then
    v_risk_score := v_risk_score + 0.4;
  elsif v_subscription_status = 'canceled' then
    v_risk_score := 1.0; -- Already churned
  end if;

  -- Factor 3: Declining usage trend (0.3 weight)
  -- This would require comparing recent vs previous period
  -- Simplified: if last 7 days < 50% of previous 7 days
  -- (Implementation simplified for migration)

  -- Clamp to 0.0-1.0
  if v_risk_score > 1.0 then
    v_risk_score := 1.0;
  end if;

  return v_risk_score;
end;
$$;

revoke all on function public.calculate_churn_risk(uuid) from public;
grant execute on function public.calculate_churn_risk(uuid) to service_role, authenticated;

comment on table public.metered_billing_items is 'Stripe metered billing items for usage-based pricing';
comment on table public.usage_records is 'Usage records to sync with Stripe usage_record API';
comment on table public.usage_credits is 'Pre-purchased usage credits that deduct before metered billing';
comment on table public.referrals is 'Referral tracking for growth loops';
comment on table public.reseller_accounts is 'Agency/reseller accounts for white-label distribution';
comment on table public.integrations is 'Available integration connectors in marketplace';
comment on table public.integration_tokens is 'OAuth tokens for connected integrations per workspace';
comment on table public.ai_insights_metrics is 'Daily metrics snapshots for AI insights dashboard';
comment on table public.churn_prediction_events is 'Churn risk predictions and intervention tracking';

-- ============================================================================
-- 7. GROWTH LOOP EVENTS (Email automation tracking)
-- ============================================================================

create table if not exists public.growth_loop_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null check (event_type in ('win_notification', 'usage_recap', 'upgrade_prompt')),
  milestone_type text, -- 'first_reply', 'ten_replies', 'first_conversion'
  metadata jsonb default '{}',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_growth_loop_events_workspace 
  on public.growth_loop_events(workspace_id, created_at desc);

alter table public.growth_loop_events enable row level security;

create policy "workspace_members_read_growth_events" on public.growth_loop_events
  for select using (public.is_workspace_member(workspace_id));

create policy "service_role_manage_growth_events" on public.growth_loop_events
  for all using (auth.role() = 'service_role');

comment on table public.growth_loop_events is 'Growth loop automation events (win notifications, usage recaps)';

