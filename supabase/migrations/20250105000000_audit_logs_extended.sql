-- Extend audit_logs table with entity_type, entity_id, and actor field
-- Add log_audit RPC function for server-side logging

-- Add new columns if they don't exist
alter table public.audit_logs
  add column if not exists actor uuid references auth.users(id),
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;

-- Update actor from actor_id for backward compatibility
update public.audit_logs
set actor = actor_id
where actor is null and actor_id is not null;

-- Drop old action constraint and add new one with all actions
alter table public.audit_logs
  drop constraint if exists audit_logs_action_check;

alter table public.audit_logs
  add constraint audit_logs_action_check check (action in (
    'share.add', 'share.update', 'share.remove',
    'invite.create', 'invite.accept', 'invite.expire',
    'launch', 'launch_denied', 'launch_blocked', 'launch_error',
    'pause', 'resume',
    'edit_template', 'queue_build', 'tick_error',
    'share_add', 'share_remove', 'role_change',
    'schedule_update'
  ));

-- Add entity_type constraint
alter table public.audit_logs
  drop constraint if exists audit_logs_entity_type_check;

alter table public.audit_logs
  add constraint audit_logs_entity_type_check check (
    entity_type is null or entity_type in ('campaign','template','queue','share','billing','settings')
  );

-- Create indexes for new columns
create index if not exists idx_audit_actor_time on public.audit_logs(actor, created_at desc);
create index if not exists idx_audit_entity on public.audit_logs(entity_type, entity_id);

-- Update RLS: allow service_role to insert
drop policy if exists ins_audit_srv on public.audit_logs;
create policy ins_audit_srv on public.audit_logs
for insert to service_role
using (true) with check (true);

-- Update select policy to use user_campaign_role helper
drop policy if exists sel_audit on public.audit_logs;
create policy sel_audit on public.audit_logs
for select to authenticated
using ( public.user_campaign_role(campaign_id) is not null );

-- Helper RPC for server code (inserts with service role)
create or replace function public.log_audit(
  p_actor uuid,
  p_campaign uuid,
  p_entity_type text,
  p_entity uuid,
  p_action text,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.audit_logs(actor, campaign_id, entity_type, entity_id, action, meta)
  values (p_actor, p_campaign, p_entity_type, p_entity, p_action, coalesce(p_meta,'{}'::jsonb));
end;
$$;

-- Ensure is_campaign_owner function exists (may already exist)
create or replace function public.is_campaign_owner(p_campaign uuid)
returns boolean
language sql stable as $$
  select exists(select 1 from public.campaigns c where c.id=p_campaign and c.user_id=auth.uid());
$$;

-- Create v_campaign_health_7d view if it doesn't exist (alias for v_campaign_health)
create or replace view public.v_campaign_health_7d as
select
  campaign_id,
  sends_7d as sent_7d,
  bounce_rate_7d,
  complaints_7d,
  complaint_rate_7d
from public.v_campaign_health
where campaign_id is not null;

