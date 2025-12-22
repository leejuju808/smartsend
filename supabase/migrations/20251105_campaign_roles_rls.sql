-- Campaign roles, RLS policies, and convenience views
-- Run in Supabase SQL or via migrations

-- 1) Role helpers (fast, reusable)

-- A) Compute role for current_user (auth.uid()) or a given user
create or replace function public.user_campaign_role(p_campaign uuid, p_user uuid default auth.uid())
returns text
language sql
stable
as $$
  with mine as (
    select 'owner'::text as role
    from public.campaigns c
    where c.id = p_campaign
      and c.user_id = p_user
  ),
  shared as (
    select cs.role
    from public.campaign_shares cs
    where cs.campaign_id = p_campaign
      and cs.user_id = p_user
  )
  select coalesce(
    (select role from mine),
    (select case when role='editor' then 'editor' when role='viewer' then 'viewer' end from shared),
    null
  );
$$;

-- B) Convenience predicates
create or replace function public.can_view_campaign(p_campaign uuid, p_user uuid default auth.uid())
returns boolean
language sql stable as $$
  select public.user_campaign_role(p_campaign, p_user) is not null;
$$;

create or replace function public.can_edit_campaign(p_campaign uuid, p_user uuid default auth.uid())
returns boolean
language sql stable as $$
  select public.user_campaign_role(p_campaign, p_user) in ('owner','editor');
$$;

create or replace function public.is_owner_campaign(p_campaign uuid, p_user uuid default auth.uid())
returns boolean
language sql stable as $$
  select public.user_campaign_role(p_campaign, p_user) = 'owner';
$$;

-- 2) Enable RLS and policies

-- Campaigns
alter table if exists public.campaigns enable row level security;

-- SELECT: owner or shared
drop policy if exists sel_campaigns on public.campaigns;
create policy sel_campaigns on public.campaigns
for select using ( public.can_view_campaign(id) );

-- INSERT: owner only (the inserting user becomes owner)
drop policy if exists ins_campaigns on public.campaigns;
create policy ins_campaigns on public.campaigns
for insert with check ( user_id = auth.uid() );

-- UPDATE: owner or editor
drop policy if exists upd_campaigns on public.campaigns;
create policy upd_campaigns on public.campaigns
for update using ( public.can_edit_campaign(id) )
with check ( public.can_edit_campaign(id) );

-- DELETE: owner only
drop policy if exists del_campaigns on public.campaigns;
create policy del_campaigns on public.campaigns
for delete using ( public.is_owner_campaign(id) );

-- Campaign Shares
alter table if exists public.campaign_shares enable row level security;

-- SELECT: anyone who can view the campaign may see its share list
drop policy if exists sel_shares on public.campaign_shares;
create policy sel_shares on public.campaign_shares
for select using ( public.can_view_campaign(campaign_id) );

-- INSERT/UPDATE/DELETE: only owner can manage shares
drop policy if exists mut_shares on public.campaign_shares;
create policy mut_shares on public.campaign_shares
for all using ( public.is_owner_campaign(campaign_id) )
with check ( public.is_owner_campaign(campaign_id) );

-- Campaign Steps
alter table if exists public.campaign_steps enable row level security;

-- SELECT: viewers can read steps
drop policy if exists sel_steps on public.campaign_steps;
create policy sel_steps on public.campaign_steps
for select using ( public.can_view_campaign(campaign_id) );

-- INSERT/UPDATE/DELETE: editors & owners
drop policy if exists mut_steps on public.campaign_steps;
create policy mut_steps on public.campaign_steps
for all using ( public.can_edit_campaign(campaign_id) )
with check ( public.can_edit_campaign(campaign_id) );

-- Send Queue
alter table if exists public.send_queue enable row level security;

-- SELECT: viewers see queue
drop policy if exists sel_queue on public.send_queue;
create policy sel_queue on public.send_queue
for select using ( public.can_view_campaign(campaign_id) );

-- UPDATE/DELETE/INSERT: editors & owners
drop policy if exists mut_queue on public.send_queue;
create policy mut_queue on public.send_queue
for all using ( public.can_edit_campaign(campaign_id) )
with check ( public.can_edit_campaign(campaign_id) );

-- Send Logs (read-only to viewers; no public writes)
alter table if exists public.send_logs enable row level security;

drop policy if exists sel_logs on public.send_logs;
create policy sel_logs on public.send_logs
for select using ( public.can_view_campaign(campaign_id) );

-- Inserts should come from SECURITY DEFINER functions using service role. No user-level writes.

-- Inbox Threads & Messages
alter table if exists public.inbox_threads enable row level security;
alter table if exists public.inbox_messages enable row level security;

-- THREADS
drop policy if exists sel_threads on public.inbox_threads;
create policy sel_threads on public.inbox_threads
for select using ( public.can_view_campaign(campaign_id) );

drop policy if exists upd_threads on public.inbox_threads;
create policy upd_threads on public.inbox_threads
for update using ( public.can_edit_campaign(campaign_id) )
with check ( public.can_edit_campaign(campaign_id) );

-- MESSAGES
drop policy if exists sel_msgs on public.inbox_messages;
create policy sel_msgs on public.inbox_messages
for select using ( public.can_view_campaign(campaign_id) );

-- No direct user inserts for inbound/outbound; done by service key functions.

-- 3) “My Campaigns” convenience views

-- Campaigns I own or are shared with me
create or replace view public.v_my_campaigns as
select
  c.*,
  public.user_campaign_role(c.id) as my_role
from public.campaigns c
where public.can_view_campaign(c.id);

-- Steps joined with permissions
create or replace view public.v_my_campaign_steps as
select
  s.*,
  public.user_campaign_role(s.campaign_id) as my_role
from public.campaign_steps s
where public.can_view_campaign(s.campaign_id);

-- Queue & logs visibility with role
create or replace view public.v_my_send_queue as
select q.*, public.user_campaign_role(q.campaign_id) as my_role
from public.send_queue q
where public.can_view_campaign(q.campaign_id);

create or replace view public.v_my_send_logs as
select l.*, public.user_campaign_role(l.campaign_id) as my_role
from public.send_logs l
where public.can_view_campaign(l.campaign_id);

-- 4) Minimal API guardrails (notes)
-- PostgREST / client:
-- - List campaigns: select * from v_my_campaigns order by created_at desc
-- - Edit steps/queue: rely on RLS (403 means viewer-only). with check prevents escalation.
-- - Manage shares: only owners can write to campaign_shares.

-- 5) Quick sanity tests (SQL)
-- As owner (your session): should return 'owner'
-- select public.user_campaign_role('<campaign_id>');
-- As shared viewer/editor (another auth.uid() session): returns 'viewer' or 'editor'
-- Try reading and updating a step; update should fail for viewer, succeed for editor.
-- Attempt to insert a share as non-owner: should be denied by RLS.

-- 6) SECURITY DEFINER reminder
-- Service functions (claim_send_batch, complete_send_attempt, enqueue_next_campaign_step, ingest-inbound)
-- should be SECURITY DEFINER and invoked with service role, not exposed to client auth.


