-- Unified Timeline View for Lead Threads
-- This migration creates a view that unifies outbound emails and inbound replies
-- for a complete thread view per lead

-- Add thread_id, subject, snippet to campaign_recipients if they don't exist
alter table if exists public.campaign_recipients 
  add column if not exists thread_id text,
  add column if not exists subject text,
  add column if not exists snippet text;

-- Create unified timeline view
-- This view unions outbound campaign sends with inbound replies
create or replace view v_thread_timeline as
select
  cr.user_id as user_id,  -- For RLS
  cr.email_lower as lead_id,  -- Use email as identifier
  cr.thread_id,
  cr.sent_at as ts,
  'outbound'::text as kind,
  cr.subject,
  cr.snippet,
  null::text as from_email,
  cr.id as source_id,
  cr.campaign_id
from campaign_recipients cr
where cr.status = 'sent' and cr.sent_at is not null

union all

select
  er.user_id as user_id,  -- For RLS
  er.from_email as lead_id,  -- Use from_email to match with recipient email
  null as thread_id,  -- Replies don't have thread_id yet
  er.created_at as ts,
  'inbound'::text as kind,
  er.subject,
  left(coalesce(er.text_body, er.html_body, ''), 200) as snippet,
  er.from_email,
  er.id as source_id,
  null as campaign_id
from email_replies er
where er.created_at is not null;

-- Create indexes for performance
create index if not exists idx_v_thread_timeline_user_lead_ts on v_thread_timeline(user_id, lead_id, ts desc);
create index if not exists idx_campaign_recipients_user_contact on campaign_recipients(user_id, contact_id) where status = 'sent';
create index if not exists idx_email_replies_user_from on email_replies(user_id, from_email, created_at desc);

-- RLS for the view (inherits from base tables)
alter view v_thread_timeline enable row level security;
create policy "Users can view their own thread timeline" on v_thread_timeline
  for select using (user_id = auth.uid());
