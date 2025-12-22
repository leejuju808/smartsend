-- =========================================================
-- Block 21394 — SmartSend Roofing Fast-Estimate Link in AI Replies
-- Add fast_estimate_url column to organization_notification_settings
-- =========================================================

alter table public.organization_notification_settings
  add column if not exists fast_estimate_url text;

comment on column public.organization_notification_settings.fast_estimate_url is 'Booking/calendly link for fast estimate scheduling. SmartSend will include this in AI replies so homeowners can book estimates in one click.';















































