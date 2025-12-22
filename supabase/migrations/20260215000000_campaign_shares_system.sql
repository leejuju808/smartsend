-- Campaign Shares System
-- Allows campaign owners to share campaigns with specific users via email with roles

-- 1. Create campaign_shares table
create table if not exists public.campaign_shares (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer','editor')),
  unique (campaign_id, user_id)
);

-- Fast lookups
create index if not exists idx_campaign_shares_campaign on public.campaign_shares(campaign_id);
create index if not exists idx_campaign_shares_user on public.campaign_shares(user_id);

-- 2. Helper: compute role (owner > editor > viewer)
create or replace function public.user_campaign_role(p_campaign uuid)
returns text
language sql stable as $$
  with mine as (
    select 'owner'::text as role
    from public.campaigns c
    where c.id = p_campaign and c.user_id = auth.uid()
  ), shared as (
    select s.role from public.campaign_shares s
    where s.campaign_id = p_campaign and s.user_id = auth.uid()
  )
  select coalesce( (select role from mine),
                   (select role from shared),
                   null);
$$;

-- 3. Helper: booleans for policies
create or replace function public.can_view_campaign(p_campaign uuid) returns boolean
language sql stable as $$
  select user_campaign_role(p_campaign) is not null;
$$;

create or replace function public.can_edit_campaign(p_campaign uuid) returns boolean
language sql stable as $$
  select user_campaign_role(p_campaign) in ('owner','editor');
$$;

-- 4. RLS on campaign_shares
alter table public.campaign_shares enable row level security;

create policy "campaign_shares_read" on public.campaign_shares
  for select using (can_view_campaign(campaign_id));

-- Only owners can manage shares
create policy "campaign_shares_write" on public.campaign_shares
  for insert with check (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  );

create policy "campaign_shares_update" on public.campaign_shares
  for update using (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  );

create policy "campaign_shares_delete" on public.campaign_shares
  for delete using (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  );

-- 5. Update RLS on campaigns table to use sharing
drop policy if exists "campaigns_owner_all" on public.campaigns;
drop policy if exists "campaigns read by access" on public.campaigns;
drop policy if exists "campaigns_read on public.campaigns";

create policy campaigns_read on public.campaigns
  for select using (auth.uid() = user_id or can_view_campaign(id));

-- Owners can update/delete campaigns (not editors)
create policy campaigns_write on public.campaigns
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 6. Apply sharing policies to campaign_leads
drop policy if exists "campaign_leads_owner" on public.campaign_leads;
drop policy if exists "leads read by campaign access" on public.campaign_leads;
drop policy if exists "campaign_leads_read on public.campaign_leads";

create policy campaign_leads_read on public.campaign_leads
  for select using (can_view_campaign(campaign_id));

create policy campaign_leads_write on public.campaign_leads
  for insert with check (can_edit_campaign(campaign_id));

create policy campaign_leads_update on public.campaign_leads
  for update using (can_edit_campaign(campaign_id)) with check (can_edit_campaign(campaign_id));

create policy campaign_leads_delete on public.campaign_leads
  for delete using (can_edit_campaign(campaign_id));

-- 7. Apply sharing policies to send_queue (read-only for viewers, editable for editors)
drop policy if exists "send_queue_owner" on public.send_queue;
drop policy if exists "send_queue_owner_all" on public.send_queue;
drop policy if exists "queue read by campaign access" on public.send_queue;

create policy queue_read on public.send_queue
  for select using (can_view_campaign(campaign_id));

-- Editors can update send_queue
create policy queue_update on public.send_queue
  for update using (can_edit_campaign(campaign_id)) with check (can_edit_campaign(campaign_id));

-- 8. Apply sharing policies to send_logs (read-only for viewers)
drop policy if exists "logs read by campaign access" on public.send_logs;

create policy logs_read on public.send_logs
  for select using (can_view_campaign(campaign_id));

-- 9. Apply sharing policies to email_events (read-only for viewers)
drop policy if exists "events_read on public.email_events";

-- Find if email_events exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'email_events') then
    create policy events_read on public.email_events
      for select using (can_view_campaign(campaign_id));
  end if;
end $$;

-- 10. Apply sharing policies to lead_activity (read-only for viewers)
drop policy if exists "activity_read on public.lead_activity";

-- Find if lead_activity exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'lead_activity') then
    create policy activity_read on public.lead_activity
      for select using (can_view_campaign(campaign_id));
  end if;
end $$;

-- 11. RPC: Share campaign by email (SECURITY DEFINER)
create or replace function public.share_campaign_with_email(p_campaign uuid, p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target uuid;
  myrole text;
begin
  -- only owner may modify shares
  select user_campaign_role(p_campaign) into myrole;
  if myrole is null or myrole <> 'owner' then
    raise exception 'not authorized';
  end if;

  -- find user in auth.users
  select id into target from auth.users where lower(email) = lower(p_email);
  if target is null then
    raise exception 'no such user: %', p_email;
  end if;

  -- upsert share
  insert into public.campaign_shares(campaign_id, user_id, role)
  values (p_campaign, target, p_role)
  on conflict (campaign_id, user_id) do update set role = excluded.role;
end;
$$;

revoke all on function public.share_campaign_with_email(uuid, text, text) from public;
grant execute on function public.share_campaign_with_email(uuid, text, text) to authenticated;

-- 12. RPC: Remove share
create or replace function public.unshare_campaign_with_user(p_campaign uuid, p_user uuid)
returns void
language plpgsql
security definer
as $$
begin
  if user_campaign_role(p_campaign) <> 'owner' then
    raise exception 'not authorized';
  end if;
  delete from public.campaign_shares where campaign_id = p_campaign and user_id = p_user;
end;
$$;

revoke all on function public.unshare_campaign_with_user(uuid, uuid) from public;
grant execute on function public.unshare_campaign_with_user(uuid, uuid) to authenticated;

