-- =========================================================
-- Block 8740 — Lead Timeline RPC + Global Lead Drawer Provider
-- =========================================================
-- Creates a simple SQL function that combines outbound emails,
-- inbound replies, and tasks into a unified timeline.

-- RPC Function: lead_timeline_last5
-- Returns the last 5 events for a lead, combining:
-- - Outbound emails (from send_logs or outbound_emails)
-- - Inbound emails (from inbound_emails)
-- - Tasks (from lead_tasks)

create or replace function public.lead_timeline_last5(p_lead_id uuid)
returns table (
  type text,
  summary text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  (
    -- Outbound emails from send_logs (has lead_id, uses created_at as timestamp)
    select
      'outbound_email'::text as type,
      'Email sent'::text as summary,
      created_at
    from send_logs
    where lead_id = p_lead_id
      and status = 'sent'

    union all

    -- Outbound emails from outbound_emails table (if it has lead_id column)
    -- Try to get subject if available
    select
      'outbound_email'::text as type,
      case
        when subject is not null and subject != '' then
          'Email sent: ' || left(subject, 80)
        else
          'Email sent'
      end as summary,
      sent_at as created_at
    from outbound_emails
    where exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'outbound_emails'
        and column_name = 'lead_id'
    )
      and lead_id = p_lead_id
      and status = 'sent'
      and sent_at is not null

    union all

    -- Inbound emails
    select
      'inbound_email'::text as type,
      case
        when subject is not null and subject != '' then
          'Reply received: ' || left(subject, 80)
        else
          'Reply received'
      end as summary,
      created_at
    from inbound_emails
    where lead_id = p_lead_id

    union all

    -- Tasks
    select
      'task'::text as type,
      coalesce('Task: ' || left(title, 80), 'Task created') as summary,
      created_at
    from lead_tasks
    where lead_id = p_lead_id
  )
  order by created_at desc
  limit 5;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.lead_timeline_last5(uuid) to authenticated;

comment on function public.lead_timeline_last5(uuid) is
  'Returns the last 5 timeline events for a lead, combining outbound emails, inbound emails, and tasks.';

