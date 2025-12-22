-- Block 410 — Lead Profile Panel v1
-- Add phone + notes columns to leads table and create stats RPC function

-- 0️⃣ Add lead metadata fields
alter table public.leads
  add column if not exists phone text;

alter table public.leads
  add column if not exists notes text;

-- 1.1 Add helper RPC for stats
create or replace function email_event_stats_for_lead (p_lead_id uuid)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'sent', (select count(*) from email_events where lead_id = p_lead_id and event_type in ('sent')),
    'open', (select count(*) from email_events where lead_id = p_lead_id and event_type in ('open', 'opened')),
    'click', (select count(*) from email_events where lead_id = p_lead_id and event_type in ('click', 'clicked')),
    'reply', (select count(*) from email_events where lead_id = p_lead_id and event_type in ('reply', 'replied')),
    'last_activity', (select max(created_at) from email_events where lead_id = p_lead_id)
  );
$$;

