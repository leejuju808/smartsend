-- Block 188: Activity Log Collaboration Events
-- Adds collaboration event types to activity_log

-- Drop and recreate the constraint with new event types
alter table public.activity_log
  drop constraint if exists activity_log_event_type_check;

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

      -- Collaboration events (Block 188)
      'assigned',
      'note_added',
      'status_change'
    )
  );

-- Comments
comment on column public.activity_log.event_type is 'Type of event that occurred - includes collaboration events: assigned, note_added, status_change';












