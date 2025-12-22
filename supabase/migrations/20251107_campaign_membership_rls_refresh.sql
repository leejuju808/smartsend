-- 1) SQL — membership helpers (idempotent)

create or replace function public.is_campaign_viewer(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.campaign_members m
    where m.campaign_id = p_campaign
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_campaign_editor(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.campaign_members m
    where m.campaign_id = p_campaign
      and m.user_id = auth.uid()
      and m.role in ('owner','editor')
  );
$$;

create or replace function public.is_campaign_owner(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select coalesce((
    select true
    from public.campaign_members m
    where m.campaign_id = p_campaign
      and m.user_id = auth.uid()
      and m.role = 'owner'
    limit 1
  ), (
    select c.user_id = auth.uid()
    from public.campaigns c
    where c.id = p_campaign
  ), false);
$$;

-- Preserve legacy helpers for existing references

create or replace function public.can_view_campaign(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select public.is_campaign_viewer(p_campaign);
$$;

create or replace function public.can_edit_campaign(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select public.is_campaign_editor(p_campaign);
$$;

-- 2) SQL — RLS policies on core tables (idempotent)

-- A) campaigns (owner read/write, members read)

alter table public.campaigns enable row level security;

drop policy if exists campaigns_view on public.campaigns;
drop policy if exists campaigns_edit on public.campaigns;
drop policy if exists "campaigns_select" on public.campaigns;
drop policy if exists "campaigns_insert" on public.campaigns;
drop policy if exists "campaigns_update" on public.campaigns;
drop policy if exists "campaigns_delete" on public.campaigns;

create policy "campaigns_select" on public.campaigns
for select
to authenticated
using ( public.is_campaign_viewer(id) or public.is_campaign_owner(id) );

create policy "campaigns_insert" on public.campaigns
for insert
to authenticated
with check ( user_id = auth.uid() );

create policy "campaigns_update" on public.campaigns
for update
to authenticated
using ( public.is_campaign_owner(id) )
with check ( public.is_campaign_owner(id) );

create policy "campaigns_delete" on public.campaigns
for delete
to authenticated
using ( public.is_campaign_owner(id) );

-- B) campaign_members (owner controls membership; members can read; self can leave)

alter table public.campaign_members enable row level security;

drop policy if exists cm_view on public.campaign_members;
drop policy if exists cm_manage on public.campaign_members;
drop policy if exists "cmm_select" on public.campaign_members;
drop policy if exists "cmm_insert" on public.campaign_members;
drop policy if exists "cmm_update" on public.campaign_members;
drop policy if exists "cmm_delete" on public.campaign_members;

create policy "cmm_select" on public.campaign_members
for select
to authenticated
using ( public.is_campaign_viewer(campaign_id) );

create policy "cmm_insert" on public.campaign_members
for insert
to authenticated
with check ( public.is_campaign_owner(campaign_id) );

create policy "cmm_update" on public.campaign_members
for update
to authenticated
using ( public.is_campaign_owner(campaign_id) )
with check ( public.is_campaign_owner(campaign_id) );

create policy "cmm_delete" on public.campaign_members
for delete
to authenticated
using (
  public.is_campaign_owner(campaign_id)
  or user_id = auth.uid()
);

-- C) campaign_leads (viewer read; editor write)

alter table public.campaign_leads enable row level security;

drop policy if exists cl_view on public.campaign_leads;
drop policy if exists "cl_select" on public.campaign_leads;
drop policy if exists "cl_write" on public.campaign_leads;

create policy "cl_select" on public.campaign_leads
for select
to authenticated
using ( public.is_campaign_viewer(campaign_id) );

create policy "cl_write" on public.campaign_leads
for all
to authenticated
using ( public.is_campaign_editor(campaign_id) )
with check ( public.is_campaign_editor(campaign_id) );

-- D) campaign_steps & campaign_step_variants (viewer read; editor write)

alter table public.campaign_steps enable row level security;
alter table public.campaign_step_variants enable row level security;

drop policy if exists steps_view on public.campaign_steps;
drop policy if exists steps_edit on public.campaign_steps;
drop policy if exists "steps_select" on public.campaign_steps;
drop policy if exists "steps_write" on public.campaign_steps;

drop policy if exists vars_view on public.campaign_step_variants;
drop policy if exists vars_edit on public.campaign_step_variants;
drop policy if exists "vars_select" on public.campaign_step_variants;
drop policy if exists "vars_write" on public.campaign_step_variants;

create policy "steps_select" on public.campaign_steps
for select to authenticated
using ( public.is_campaign_viewer(campaign_id) );

create policy "steps_write" on public.campaign_steps
for all to authenticated
using ( public.is_campaign_editor(campaign_id) )
with check ( public.is_campaign_editor(campaign_id) );

create policy "vars_select" on public.campaign_step_variants
for select to authenticated
using ( public.is_campaign_viewer(campaign_id) );

create policy "vars_write" on public.campaign_step_variants
for all to authenticated
using ( public.is_campaign_editor(campaign_id) )
with check ( public.is_campaign_editor(campaign_id) );

-- E) inbox_threads / inbox_messages (viewer read; editor write drafts/sends elsewhere)

alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;

drop policy if exists threads_view on public.inbox_threads;
drop policy if exists "threads_select" on public.inbox_threads;

drop policy if exists msgs_view on public.inbox_messages;
drop policy if exists msgs_manage on public.inbox_messages;
drop policy if exists "msgs_select" on public.inbox_messages;
drop policy if exists "msgs_insert" on public.inbox_messages;

create policy "threads_select" on public.inbox_threads
for select to authenticated
using ( public.is_campaign_viewer(campaign_id) );

create policy "msgs_select" on public.inbox_messages
for select to authenticated
using (
  exists (
    select 1 from public.inbox_threads t
    where t.id = inbox_messages.thread_id
      and public.is_campaign_viewer(t.campaign_id)
  )
);

create policy "msgs_insert" on public.inbox_messages
for insert to authenticated
with check (
  exists (
    select 1 from public.inbox_threads t
    where t.id = thread_id
      and public.is_campaign_editor(t.campaign_id)
  )
);

-- F) reply_drafts (viewer read; editor write)

alter table public.reply_drafts enable row level security;

drop policy if exists drafts_view on public.reply_drafts;
drop policy if exists drafts_manage on public.reply_drafts;
drop policy if exists "drafts_select" on public.reply_drafts;
drop policy if exists "drafts_write" on public.reply_drafts;

create policy "drafts_select" on public.reply_drafts
for select to authenticated
using (
  exists (
    select 1 from public.inbox_threads t
    where t.id = reply_drafts.thread_id
      and public.is_campaign_viewer(t.campaign_id)
  )
);

create policy "drafts_write" on public.reply_drafts
for all to authenticated
using (
  exists (
    select 1 from public.inbox_threads t
    where t.id = reply_drafts.thread_id
      and public.is_campaign_editor(t.campaign_id)
  )
)
with check (
  exists (
    select 1 from public.inbox_threads t
    where t.id = reply_drafts.thread_id
      and public.is_campaign_editor(t.campaign_id)
  )
);

-- G) send_logs / delivery_events (viewer read; writes are service-role only)

alter table public.send_logs enable row level security;
alter table public.delivery_events enable row level security;

drop policy if exists logs_view on public.send_logs;
drop policy if exists "logs_select" on public.send_logs;

drop policy if exists events_view on public.delivery_events;
drop policy if exists "events_select" on public.delivery_events;

create policy "logs_select" on public.send_logs
for select to authenticated
using ( public.is_campaign_viewer(campaign_id) );

create policy "events_select" on public.delivery_events
for select to authenticated
using (
  exists (
    select 1 from public.send_logs l
    where l.id = delivery_events.send_log_id
      and public.is_campaign_viewer(l.campaign_id)
  )
);

-- 3) Safety/consistency sweeps (quick)

insert into public.campaign_members (campaign_id, user_id, role)
select c.id, c.user_id, 'owner'
from public.campaigns c
where not exists (
  select 1 from public.campaign_members m
  where m.campaign_id = c.id and m.role = 'owner'
);

create index if not exists idx_inbox_msgs_thread on public.inbox_messages(thread_id);
create index if not exists idx_replydrafts_thread on public.reply_drafts(thread_id);




