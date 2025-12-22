-- Block 187: Human Handoff + CRM Push - Activity Log Handoff Events
-- Adds handoff event types to activity_log

-- Drop the existing check constraint
alter table public.activity_log
  drop constraint if exists activity_log_event_type_check;

-- Add new check constraint with handoff events
alter table public.activity_log
  add constraint activity_log_event_type_check
  check (
    event_type in (
      'email_sent',
      'email_open',
      'email_click',
      'email_reply',
      'email_bounce',
      'email_unsubscribe',

      'intent_signal',
      'company_hot',
      'company_engagement_update',

      'smartlist_refresh',
      'smartlist_rule_change',

      'scheduler_dispatch',
      'scheduler_skip_window',
      'scheduler_retry',

      'deliverability_warning',
      'deliverability_pause',

      'campaign_paused',
      'campaign_resumed',

      'handoff_initiated',
      'handoff_success',
      'handoff_failed'
    )
  );

-- Comment
comment on column public.activity_log.event_type is 'Type of event that occurred, including handoff events (handoff_initiated, handoff_success, handoff_failed)';












