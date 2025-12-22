-- Ownership Transfer + Soft Delete System
-- Adds ownership transfer, soft delete, and updates RLS to respect soft delete

-- ============================================
-- 1) Soft delete flag on campaigns
-- ============================================
alter table public.campaigns
  add column if not exists deleted_at timestamptz;

-- ============================================
-- 2) Update RLS policies to filter deleted campaigns
-- ============================================

-- Never show deleted to non-owners (tweak existing policies)
drop policy if exists "campaigns_shared_r" on public.campaigns;
drop policy if exists "campaigns.select.owner_or_shared" on public.campaigns;
drop policy if exists "campaigns_read" on public.campaigns;

create policy "campaigns.select.owner_or_shared"
on public.campaigns
for select
using (
  public.can_view_campaign(id)
  and deleted_at is null
);

-- Owners can still read their deleted campaigns (for restore)
drop policy if exists "campaigns_owner_rw" on public.campaigns;
drop policy if exists "campaigns.update.owner_or_editor" on public.campaigns;
drop policy if exists "campaigns.update.owner_or_editor_or_orgadmin" on public.campaigns;

-- Allow owners to read deleted campaigns (but not edit unless restored)
create policy "campaigns.owner_read_deleted"
on public.campaigns
for select
using (
  user_id = auth.uid()
);

-- Update policy for owners/editors (preserve org admin support if org_members table exists)
drop policy if exists "campaigns.update.owner_or_editor" on public.campaigns;
drop policy if exists "campaigns.update.owner_or_editor_or_orgadmin" on public.campaigns;

-- Try to preserve org admin support if org_members exists, otherwise use simple version
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'org_members'
  ) then
    create policy "campaigns.update.owner_or_editor_or_orgadmin"
    on public.campaigns
    for update
    using (
      (
        public.can_edit_campaign(id)
        or exists (
          select 1 from public.org_members m 
          where m.org_id = coalesce(campaigns.org_id, campaigns.owner_org_id)
            and m.user_id = auth.uid()
            and m.role in ('admin', 'owner')
        )
      )
      and deleted_at is null
    )
    with check (
      (
        public.can_edit_campaign(id)
        or exists (
          select 1 from public.org_members m 
          where m.org_id = coalesce(campaigns.org_id, campaigns.owner_org_id)
            and m.user_id = auth.uid()
            and m.role in ('admin', 'owner')
        )
      )
      and deleted_at is null
    );
  else
    create policy "campaigns.update.owner_or_editor"
    on public.campaigns
    for update
    using (
      public.can_edit_campaign(id)
      and deleted_at is null
    )
    with check (
      public.can_edit_campaign(id)
      and deleted_at is null
    );
  end if;
end $$;

-- ============================================
-- 3) Helper: transfer ownership
-- ============================================
create or replace function public.transfer_campaign_ownership(p_campaign uuid, p_new_owner uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_owner uuid;
  v_exists int;
begin
  -- only current owner can transfer
  select user_id into v_old_owner
  from public.campaigns
  where id = p_campaign;

  if v_old_owner is null then
    raise exception 'Campaign not found';
  end if;

  if v_old_owner <> auth.uid() then
    raise exception 'Only the current owner may transfer ownership';
  end if;

  -- new owner must be a valid user
  perform 1 from auth.users where id = p_new_owner;
  if not found then
    raise exception 'New owner not found';
  end if;

  -- ensure new owner has at least viewer share (optional); if not, add as editor
  select count(*) into v_exists
  from public.campaign_shares
  where campaign_id = p_campaign and user_id = p_new_owner;

  if v_exists = 0 then
    insert into public.campaign_shares (campaign_id, user_id, role)
    values (p_campaign, p_new_owner, 'editor');
  end if;

  -- perform transfer
  update public.campaigns
  set user_id = p_new_owner
  where id = p_campaign;

  -- demote old owner to editor (or keep share if exists, else add)
  select count(*) into v_exists
  from public.campaign_shares
  where campaign_id = p_campaign and user_id = v_old_owner;

  if v_exists = 0 then
    insert into public.campaign_shares (campaign_id, user_id, role)
    values (p_campaign, v_old_owner, 'editor');
  else
    update public.campaign_shares
    set role = 'editor'
    where campaign_id = p_campaign and user_id = v_old_owner;
  end if;

  -- log
  insert into public.audit_logs (campaign_id, actor_id, action, target_user_id, meta)
  values (p_campaign, auth.uid(), 'share.update', p_new_owner, jsonb_build_object('ownership_transfer', true));

  return 'ok';
end
$$;

comment on function public.transfer_campaign_ownership is
'Owner-only: transfers ownership; promotes new owner (ensures share), demotes old to editor, logs event.';

-- ============================================
-- 4) Prevent orphaning: block owner deletion without transfer
-- ============================================
create or replace function public.prevent_orphan_owner()
returns trigger
language plpgsql
as $$
begin
  -- if trying to delete the owner row from campaigns (hard delete), block
  if TG_TABLE_NAME = 'campaigns' and OLD.user_id is not null then
    -- allow normal delete (we rely on soft delete), but you can block if you still do hard deletes:
    -- raise exception 'Hard delete of campaigns is disallowed; use soft delete.';
    return OLD;
  end if;

  -- if collaborator self-removes and they are owner (shouldn't happen), block
  if TG_TABLE_NAME = 'campaign_shares' then
    if exists (
      select 1 from public.campaigns c
      where c.id = OLD.campaign_id and c.user_id = OLD.user_id
    ) then
      raise exception 'Owner cannot remove self; transfer ownership first.';
    end if;
    return OLD;
  end if;

  return null;
end
$$;

drop trigger if exists tr_prevent_owner_remove on public.campaign_shares;
create trigger tr_prevent_owner_remove
before delete on public.campaign_shares
for each row execute function public.prevent_orphan_owner();

-- ============================================
-- 5) Soft delete / restore helpers
-- ============================================

-- Archive (soft delete) — owner only
create or replace function public.archive_campaign(p_campaign uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.campaigns
  set deleted_at = now()
  where id = p_campaign
    and user_id = auth.uid();

  if not found then
    raise exception 'Only owner can archive';
  end if;

  insert into public.audit_logs (campaign_id, actor_id, action, meta)
  values (p_campaign, auth.uid(), 'share.update', jsonb_build_object('archived', true));

  return 'archived';
end
$$;

-- Restore (owner only)
create or replace function public.restore_campaign(p_campaign uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.campaigns
  set deleted_at = null
  where id = p_campaign
    and user_id = auth.uid();

  if not found then
    raise exception 'Only owner can restore';
  end if;

  insert into public.audit_logs (campaign_id, actor_id, action, meta)
  values (p_campaign, auth.uid(), 'share.update', jsonb_build_object('restored', true));

  return 'restored';
end
$$;

-- ============================================
-- 6) RLS — Respect soft delete in dependent tables
-- ============================================

-- campaign_steps
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'campaign_steps'
  ) then
    alter table public.campaign_steps enable row level security;
    
    drop policy if exists "steps_read" on public.campaign_steps;
    drop policy if exists "campaign_steps_select" on public.campaign_steps;
    drop policy if exists "campaign_steps_select_own" on public.campaign_steps;
    
    create policy "steps_read"
    on public.campaign_steps
    for select
    using (
      public.can_view_campaign(campaign_id)
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
    );

    drop policy if exists "steps_edit" on public.campaign_steps;
    drop policy if exists "campaign_steps_modify" on public.campaign_steps;
    drop policy if exists "campaign_steps_insert_own" on public.campaign_steps;
    drop policy if exists "campaign_steps_update_own" on public.campaign_steps;
    drop policy if exists "campaign_steps_delete_own" on public.campaign_steps;
    
    create policy "steps_edit"
    on public.campaign_steps
    for update, delete
    using (
      public.can_edit_campaign(campaign_id)
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
    );

    drop policy if exists "steps_insert" on public.campaign_steps;
    
    create policy "steps_insert"
    on public.campaign_steps
    for insert
    with check (
      public.can_edit_campaign(campaign_id)
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
    );
  end if;
end $$;

-- send_queue
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'send_queue'
  ) then
    alter table public.send_queue enable row level security;
    
    drop policy if exists "send_queue_read" on public.send_queue;
    
    create policy "send_queue_read"
    on public.send_queue
    for select
    using (
      public.can_view_campaign(campaign_id)
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
    );

    drop policy if exists "send_queue_write" on public.send_queue;
    
    create policy "send_queue_write"
    on public.send_queue
    for all
    using (
      public.can_edit_campaign(campaign_id)
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
    )
    with check (
      public.can_edit_campaign(campaign_id)
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
    );
  end if;
end $$;

-- campaign_leads (if exists)
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'campaign_leads'
  ) then
    alter table public.campaign_leads enable row level security;
    
    drop policy if exists "campaign_leads_read" on public.campaign_leads;
    
    create policy "campaign_leads_read"
    on public.campaign_leads
    for select
    using (
      public.can_view_campaign(campaign_id)
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
    );

    drop policy if exists "campaign_leads_write" on public.campaign_leads;
    
    create policy "campaign_leads_write"
    on public.campaign_leads
    for all
    using (
      public.can_edit_campaign(campaign_id)
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
    )
    with check (
      public.can_edit_campaign(campaign_id)
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
    );
  end if;
end $$;

-- pending_invites
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'pending_invites'
  ) then
    alter table public.pending_invites enable row level security;
    
    drop policy if exists "pending_invites_read" on public.pending_invites;
    
    create policy "pending_invites_read"
    on public.pending_invites
    for select
    using (
      public.can_view_campaign(campaign_id)
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
    );

    drop policy if exists "pending_invites_write" on public.pending_invites;
    
    create policy "pending_invites_write"
    on public.pending_invites
    for all
    using (
      public.can_edit_campaign(campaign_id)
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
    )
    with check (
      public.can_edit_campaign(campaign_id)
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
    );
  end if;
end $$;

-- tracking_events (if exists)
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'tracking_events'
  ) then
    alter table public.tracking_events enable row level security;
    
    drop policy if exists "tracking_events_read" on public.tracking_events;
    
    create policy "tracking_events_read"
    on public.tracking_events
    for select
    using (
      public.can_view_campaign(campaign_id)
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
    );
  end if;
end $$;

