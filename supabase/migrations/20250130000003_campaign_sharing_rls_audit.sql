-- Campaign Sharing RLS, Helpers, and Audit Log (Idempotent)
-- This migration sets up comprehensive RLS, helper functions, and audit logging for campaign sharing

-- A) Core role helpers (owner > editor > viewer)
-- Ensure owner_id column exists (use user_id as fallback)
do $$ begin
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'campaigns' and column_name = 'owner_id') then
    alter table public.campaigns add column owner_id uuid references auth.users(id) on delete cascade;
    -- Backfill from user_id if it exists
    if exists (select 1 from information_schema.columns 
               where table_schema = 'public' and table_name = 'campaigns' and column_name = 'user_id') then
      update public.campaigns set owner_id = user_id where owner_id is null;
    end if;
  end if;
end $$;

-- Helper function to compute user's role for a campaign
create or replace function public.user_campaign_role(p_campaign uuid)
returns text
language sql stable as $$
  with mine as (
    select 'owner'::text as role
    from public.campaigns c
    where c.id = p_campaign and coalesce(c.owner_id, c.user_id) = auth.uid()
  ),
  shared as (
    select role from public.campaign_shares s
    where s.campaign_id = p_campaign and s.user_id = auth.uid()
  )
  select coalesce((select role from mine),
                  (select role from shared),
                  null);
$$;

create or replace function public.can_view_campaign(p_campaign uuid)
returns boolean language sql stable as $$
  select public.user_campaign_role(p_campaign) is not null;
$$;

create or replace function public.can_edit_campaign(p_campaign uuid)
returns boolean language sql stable as $$
  select public.user_campaign_role(p_campaign) in ('owner','editor');
$$;

-- RPC to get current user's role (for client usage)
create or replace function public.get_my_campaign_role(p_campaign uuid)
returns text language sql stable as $$
  select public.user_campaign_role(p_campaign);
$$;

grant execute on function public.get_my_campaign_role(uuid) to authenticated;

-- B) RLS policies (campaigns + children)
alter table public.campaigns enable row level security;

do $$ begin
  -- Campaigns select policy
  if not exists (select 1 from pg_policies where tablename='campaigns' and policyname='campaigns_select') then
    create policy "campaigns_select" on public.campaigns
      for select using (
        coalesce(owner_id, user_id) = auth.uid()
        or exists (select 1 from public.campaign_shares s where s.campaign_id = campaigns.id and s.user_id = auth.uid())
      );
  end if;
  
  -- Campaigns update policy (only owners can update)
  if not exists (select 1 from pg_policies where tablename='campaigns' and policyname='campaigns_update') then
    create policy "campaigns_update" on public.campaigns
      for update using (coalesce(owner_id, user_id) = auth.uid())
      with check (coalesce(owner_id, user_id) = auth.uid());
  end if;
end $$;

-- Child tables you want shared read/write access on
-- Steps
alter table public.campaign_steps enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='campaign_steps' and policyname='steps_select') then
    create policy "steps_select" on public.campaign_steps
      for select using (public.can_view_campaign(campaign_id));
  end if;
  
  if not exists (select 1 from pg_policies where tablename='campaign_steps' and policyname='steps_modify') then
    create policy "steps_modify" on public.campaign_steps
      for all using (public.can_edit_campaign(campaign_id)) 
      with check (public.can_edit_campaign(campaign_id));
  end if;
end $$;

-- Members
alter table public.campaign_members enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='campaign_members' and policyname='members_select') then
    create policy "members_select" on public.campaign_members
      for select using (public.can_view_campaign(campaign_id));
  end if;
  
  if not exists (select 1 from pg_policies where tablename='campaign_members' and policyname='members_modify') then
    create policy "members_modify" on public.campaign_members
      for all using (public.can_edit_campaign(campaign_id)) 
      with check (public.can_edit_campaign(campaign_id));
  end if;
end $$;

-- Queue (read-only for shared users)
alter table public.send_queue enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='send_queue' and policyname='queue_select') then
    create policy "queue_select" on public.send_queue
      for select using (public.can_view_campaign(campaign_id));
  end if;
end $$;

-- Logs (read-only)
alter table public.send_logs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='send_logs' and policyname='logs_select') then
    create policy "logs_select" on public.send_logs
      for select using (public.can_view_campaign(campaign_id));
  end if;
end $$;

-- Inbox (read-only for shared users)
alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='inbox_threads' and policyname='threads_select') then
    create policy "threads_select" on public.inbox_threads
      for select using (public.can_view_campaign(campaign_id));
  end if;
  
  if not exists (select 1 from pg_policies where tablename='inbox_messages' and policyname='messages_select') then
    create policy "messages_select" on public.inbox_messages
      for select using (
        exists (
          select 1 from public.inbox_threads t 
          where t.id = inbox_messages.thread_id 
          and public.can_view_campaign(t.campaign_id)
        )
      );
  end if;
end $$;

-- Shares table itself: owners manage, viewers can read who has access
alter table public.campaign_shares enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='campaign_shares' and policyname='shares_select') then
    create policy "shares_select" on public.campaign_shares
      for select using (public.can_view_campaign(campaign_id));
  end if;
  
  if not exists (select 1 from pg_policies where tablename='campaign_shares' and policyname='shares_modify') then
    create policy "shares_modify" on public.campaign_shares
      for all using (
        exists (
          select 1 from public.campaigns c 
          where c.id = campaign_shares.campaign_id 
          and coalesce(c.owner_id, c.user_id) = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.campaigns c 
          where c.id = campaign_shares.campaign_id 
          and coalesce(c.owner_id, c.user_id) = auth.uid()
        )
      );
  end if;
end $$;

-- C) Audit log
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor uuid,                         -- auth.uid()
  action text not null,               -- 'share.add','share.remove','share.update','step.create','step.update','step.delete',...
  campaign_id uuid references public.campaigns(id) on delete set null,
  entity text,                        -- 'campaign','step','share','member', etc.
  entity_id text,                     -- uuid as text or composite
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_audit_logs_campaign on public.audit_logs(campaign_id, created_at desc);
create index if not exists idx_audit_logs_actor on public.audit_logs(actor);

alter table public.audit_logs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='audit_logs' and policyname='audit_select') then
    create policy "audit_select" on public.audit_logs
      for select using (public.can_view_campaign(campaign_id));
  end if;
end $$;

-- D) Triggers to log step changes (example; add more if you want)
create or replace function public.log_step_audit()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs(actor, action, campaign_id, entity, entity_id, meta)
    values (auth.uid(), 'step.create', new.campaign_id, 'step', new.id::text, jsonb_build_object('step_no', new.step_no));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_logs(actor, action, campaign_id, entity, entity_id, meta)
    values (auth.uid(), 'step.update', new.campaign_id, 'step', new.id::text, jsonb_build_object('old', row_to_json(old), 'new', row_to_json(new)));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.audit_logs(actor, action, campaign_id, entity, entity_id, meta)
    values (auth.uid(), 'step.delete', old.campaign_id, 'step', old.id::text, jsonb_build_object('step_no', old.step_no));
    return old;
  end if;
  return null;
end $$;

drop trigger if exists trg_audit_campaign_steps on public.campaign_steps;
create trigger trg_audit_campaign_steps
after insert or update or delete on public.campaign_steps
for each row execute function public.log_step_audit();

-- E) Convenience view for campaign activity feed
create or replace view public.v_campaign_activity as
select
  a.created_at,
  a.actor,
  a.action,
  a.campaign_id,
  a.entity,
  a.entity_id,
  a.meta
from public.audit_logs a
where a.campaign_id is not null
order by a.created_at desc;

grant select on public.v_campaign_activity to authenticated;

