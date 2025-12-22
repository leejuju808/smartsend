-- Block 301 — SmartSend Inbox v2
-- Unified Inbox View for Reply Management

-- Create unified inbox view that combines reply data with lead info and AI intent
create or replace view inbox_replies_view as
select
  er.id as reply_id,
  el.workspace_id,
  el.lead_id,
  el.campaign_id,
  null::uuid as sequence_id, -- sequence_id may not exist on email_logs
  coalesce(er.body_text, er.body_html, er.raw_text, '') as body,
  jsonb_build_object(
    'provider', er.provider,
    'provider_message_id', er.provider_message_id,
    'in_reply_to', er.in_reply_to,
    'subject', er.subject,
    'from_email', er.from_email,
    'to_email', er.to_email
  ) as metadata,
  coalesce(
    (er.metadata->>'received_at')::timestamptz,
    er.received_at, 
    er.created_at
  ) as received_at,

  li.company,
  li.first_name,
  li.last_name,
  li.email as lead_email,

  ci.category,
  ci.sentiment,
  ci.intent_score,
  ci.meeting_time,
  ci.meeting_location,
  ci.meeting_link,
  ci.objection_type

from email_replies er
left join email_logs el on el.id = er.email_log_id
left join leads li on li.id = el.lead_id
left join reply_intent ci on ci.reply_id = er.id
where el.workspace_id is not null; -- Only show replies with workspace context

-- Grant access to authenticated users
grant select on inbox_replies_view to authenticated;

-- Create index on email_logs for faster joins (if not exists)
create index if not exists idx_email_logs_lead_workspace 
  on email_logs(lead_id, workspace_id) 
  where lead_id is not null and workspace_id is not null;

-- Create index on email_replies for received_at sorting
create index if not exists idx_email_replies_received_at 
  on email_replies(coalesce(received_at, created_at) desc);

-- If reply_logs table exists and has the structure mentioned in the spec, create alternative view
-- Otherwise, the above view using email_replies will work
do $$
begin
  -- Check if reply_logs has the expected columns
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'reply_logs'
    and column_name = 'workspace_id'
  ) then
    -- Create alternative view using reply_logs if it has the right structure
    execute '
    create or replace view inbox_replies_view_alt as
    select
      rl.id as reply_id,
      rl.workspace_id,
      rl.lead_id,
      rl.campaign_id,
      rl.sequence_id,
      rl.body,
      rl.metadata,
      rl.received_at,

      li.company,
      li.first_name,
      li.last_name,
      li.email as lead_email,

      ci.category,
      ci.sentiment,
      ci.intent_score,
      ci.meeting_time,
      ci.meeting_location,
      ci.meeting_link,
      ci.objection_type

    from reply_logs rl
    left join leads li on li.id = rl.lead_id
    left join reply_intent ci on ci.reply_id = rl.id;
    ';
  end if;
end $$;

