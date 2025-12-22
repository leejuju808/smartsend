-- 003_reply_detection_rls.sql
-- RLS policies for reply detection tables

-- emails: service role will patch; client can only read own workspace rows
alter table emails enable row level security;

-- Update existing policies or create new ones
drop policy if exists "read emails by org" on emails;
create policy "read emails by org" on emails
  for select using (auth.uid() is not null); -- tighten with org filters in your schema

-- Service role can manage all emails (for edge functions)
drop policy if exists "service_role_manages_emails" on emails;
create policy "service_role_manages_emails" on emails
  for all to service_role
  using (true) with check (true);

-- threads
alter table threads enable row level security;

drop policy if exists "read threads by org" on threads;
create policy "read threads by org" on threads
  for select using (auth.uid() is not null);

-- Service role can manage threads
create policy "service_role_manages_threads" on threads
  for all to service_role
  using (true) with check (true);

-- leads
alter table leads enable row level security;

drop policy if exists "read leads by org" on leads;
create policy "read leads by org" on leads
  for select using (auth.uid() is not null);

-- Service role can manage leads
create policy "service_role_manages_leads" on leads
  for all to service_role
  using (true) with check (true);

-- campaign_sends
alter table campaign_sends enable row level security;

drop policy if exists "read sends by org" on campaign_sends;
create policy "read sends by org" on campaign_sends
  for select using (auth.uid() is not null);

-- Service role can manage campaign sends
create policy "service_role_manages_sends" on campaign_sends
  for all to service_role
  using (true) with check (true);

-- email_events
alter table email_events enable row level security;

create policy "read events by org" on email_events
  for select using (auth.uid() is not null);

-- Service role can manage events
create policy "service_role_manages_events" on email_events
  for all to service_role
  using (true) with check (true);

