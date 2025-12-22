-- RLS Policies for Campaign ACL System
-- Lock down core tables to campaign membership-based access

-- A) Enable RLS
alter table public.campaigns enable row level security;
alter table public.campaign_steps enable row level security;
alter table public.campaign_step_variants enable row level security;
alter table public.send_queue enable row level security;
alter table public.send_logs enable row level security;
alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.tracking_events enable row level security;
alter table public.suppressions enable row level security;

-- B) Campaigns
drop policy if exists camp_view on public.campaigns;
create policy camp_view on public.campaigns
for select using (public.can_view_campaign(id));

drop policy if exists camp_edit on public.campaigns;
create policy camp_edit on public.campaigns
for insert with check (auth.uid() is not null)  -- inserts typically via backend; owner row added separately
, for update using (public.can_edit_campaign(id))
with check (public.can_edit_campaign(id));

drop policy if exists camp_delete on public.campaigns;
create policy camp_delete on public.campaigns
for delete using (public.is_owner_campaign(id));

-- C) Steps
drop policy if exists steps_view on public.campaign_steps;
create policy steps_view on public.campaign_steps
for select using (public.can_view_campaign(campaign_id));

drop policy if exists steps_mut on public.campaign_steps;
create policy steps_mut on public.campaign_steps
for insert with check (public.can_edit_campaign(campaign_id))
, for update using (public.can_edit_campaign(campaign_id))
with check (public.can_edit_campaign(campaign_id))
, for delete using (public.can_edit_campaign(campaign_id));

-- D) Variants
drop policy if exists variants_view on public.campaign_step_variants;
create policy variants_view on public.campaign_step_variants
for select using (public.can_view_campaign(campaign_id));

drop policy if exists variants_mut on public.campaign_step_variants;
create policy variants_mut on public.campaign_step_variants
for insert with check (public.can_edit_campaign(campaign_id))
, for update using (public.can_edit_campaign(campaign_id))
with check (public.can_edit_campaign(campaign_id))
, for delete using (public.can_edit_campaign(campaign_id));

-- E) Send queue / logs (read for viewers; write for editors+ via system funcs)
drop policy if exists queue_view on public.send_queue;
create policy queue_view on public.send_queue
for select using (public.can_view_campaign(campaign_id));

drop policy if exists queue_mut on public.send_queue;
create policy queue_mut on public.send_queue
for insert with check (public.can_edit_campaign(campaign_id))
, for update using (public.can_edit_campaign(campaign_id))
with check (public.can_edit_campaign(campaign_id))
, for delete using (public.can_edit_campaign(campaign_id));

drop policy if exists logs_view on public.send_logs;
create policy logs_view on public.send_logs
for select using (public.can_view_campaign(campaign_id));

-- typically writes come from service key; still set policy:
drop policy if exists logs_mut on public.send_logs;
create policy logs_mut on public.send_logs
for insert with check (public.can_edit_campaign(campaign_id))
, for update using (public.can_edit_campaign(campaign_id))
with check (public.can_edit_campaign(campaign_id));

-- F) Inbox threads/messages
drop policy if exists threads_view on public.inbox_threads;
create policy threads_view on public.inbox_threads
for select using (public.can_view_campaign(campaign_id));

drop policy if exists threads_mut on public.inbox_threads;
create policy threads_mut on public.inbox_threads
for update using (public.can_edit_campaign(campaign_id))
with check (public.can_edit_campaign(campaign_id));

drop policy if exists msgs_view on public.inbox_messages;
create policy msgs_view on public.inbox_messages
for select using (
  exists (
    select 1 from public.inbox_threads t
    where t.id = inbox_messages.thread_id
      and public.can_view_campaign(t.campaign_id)
  )
);

drop policy if exists msgs_mut on public.inbox_messages;
create policy msgs_mut on public.inbox_messages
for insert with check (
  exists (
    select 1 from public.inbox_threads t
    where t.id = inbox_messages.thread_id
      and public.can_edit_campaign(t.campaign_id)
  )
)
, for update using (
  exists (
    select 1 from public.inbox_threads t
    where t.id = inbox_messages.thread_id
      and public.can_edit_campaign(t.campaign_id)
  )
);

-- G) Tracking events (read-only)
drop policy if exists te_view on public.tracking_events;
create policy te_view on public.tracking_events
for select using (
  exists (
    select 1 from public.send_logs sl
    where sl.id = tracking_events.send_log_id
      and public.can_view_campaign(sl.campaign_id)
  )
);

-- H) Suppressions (viewer read; editor/owner write)
-- Note: Suppressions are user-scoped, not campaign-scoped, so we keep user_id check
drop policy if exists sup_view on public.suppressions;
create policy sup_view on public.suppressions
for select using (user_id = auth.uid());

drop policy if exists sup_mut on public.suppressions;
create policy sup_mut on public.suppressions
for insert with check (user_id = auth.uid())
, for update using (user_id = auth.uid())
with check (user_id = auth.uid())
, for delete using (user_id = auth.uid());

