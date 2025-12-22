-- Stable Export Views
-- Create RLS-friendly views for data exports (activity, send_logs, inbox, billing)
-- These views flatten related fields for easy CSV/JSON exports while preserving RLS

-- =====================================================
-- 1. Activity Export View
-- =====================================================
create or replace view public.v_export_activity as
select
  a.id,
  a.campaign_id,
  a.created_at at time zone 'utc' as created_at_utc,
  a.event,
  a.actor_id,
  a.meta
from public.campaign_activity a;

-- =====================================================
-- 2. Send Logs Export View
-- =====================================================
create or replace view public.v_export_send_logs as
select
  l.id,
  l.user_id,
  l.campaign_id,
  l.lead_id,
  l.mailbox_id,
  l.event,
  l.detail,
  l.created_at at time zone 'utc' as created_at_utc
from public.send_logs l;

-- =====================================================
-- 3. Inbox Export View
-- =====================================================
create or replace view public.v_export_inbox as
select
  i.id,
  i.user_id,
  i.campaign_id,
  i.lead_id,
  i.provider,
  i.provider_msg_id,
  i.provider_thread_id,
  i.direction,
  i.from_email,
  i.to_email,
  i.subject,
  i.reply_label,
  i.is_reply,
  i.received_at at time zone 'utc' as received_at_utc
from public.inbox_messages i;

-- =====================================================
-- 4. Billing Export View
-- =====================================================
create or replace view public.v_export_billing as
select
  b.user_id,
  b.plan_code,
  b.monthly_quota,
  b.usage_mtd,
  b.period_start,
  b.period_end,
  b.updated_at at time zone 'utc' as updated_at_utc,
  b.stripe_customer_id,
  b.stripe_subscription_id,
  b.stripe_price_id
from public.billing_accounts b;

-- Note: RLS policies on underlying tables (campaign_activity, send_logs, inbox_messages, billing_accounts)
-- ensure that these views only return rows the user can access via can_view_campaign() helpers.

