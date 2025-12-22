-- Audit Log System for Campaign Activity
-- Idempotent migration: creates audit_logs table, triggers, and helper functions

-- A) Base audit log table
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  action text not null,      -- e.g., 'invite_created', 'role_changed', 'policy_updated', 'email_sent', 'reply_received'
  entity text,               -- optional entity name: 'campaign_invites', 'send_logs', etc.
  entity_id uuid,
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_audit_campaign on public.audit_logs(campaign_id, created_at desc);
create index if not exists idx_audit_actor on public.audit_logs(actor_id, created_at desc);
create index if not exists idx_audit_action on public.audit_logs(action);

-- B) RLS
alter table public.audit_logs enable row level security;

drop policy if exists audit_view on public.audit_logs;
create policy audit_view on public.audit_logs
for select using ( public.can_view_campaign(campaign_id) );

-- C) Helper: insert_audit
create or replace function public.insert_audit(
  p_campaign uuid,
  p_action text,
  p_entity text default null,
  p_entity_id uuid default null,
  p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs(campaign_id, actor_id, action, entity, entity_id, meta)
  values (p_campaign, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_meta,'{}'::jsonb));
end;
$$;

-- D) Automatic triggers on invites, policy, send_logs, replies

-- Invite created
create or replace function public._audit_invite_created()
returns trigger language plpgsql as $$
begin
  perform public.insert_audit(NEW.campaign_id, 'invite_created', 'campaign_invites', NEW.id, jsonb_build_object('email', NEW.email, 'role', NEW.role));
  return NEW;
end;
$$;

drop trigger if exists trg_audit_invite_created on public.campaign_invites;
create trigger trg_audit_invite_created
after insert on public.campaign_invites
for each row execute function public._audit_invite_created();

-- Invite accepted
create or replace function public._audit_invite_accepted()
returns trigger language plpgsql as $$
begin
  if NEW.accepted_at is not null and (OLD.accepted_at is null or OLD.accepted_at is distinct from NEW.accepted_at) then
    perform public.insert_audit(NEW.campaign_id, 'invite_accepted', 'campaign_invites', NEW.id, jsonb_build_object('email', NEW.email));
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_audit_invite_accepted on public.campaign_invites;
create trigger trg_audit_invite_accepted
after update of accepted_at on public.campaign_invites
for each row when (NEW.accepted_at is distinct from OLD.accepted_at)
execute function public._audit_invite_accepted();

-- Policy updated
create or replace function public._audit_policy_updated()
returns trigger language plpgsql as $$
begin
  perform public.insert_audit(coalesce(NEW.campaign_id, OLD.campaign_id), 'policy_updated', 'deliverability_policies', NEW.id, to_jsonb(NEW));
  return NEW;
end;
$$;

drop trigger if exists trg_audit_policy_updated on public.deliverability_policies;
create trigger trg_audit_policy_updated
after insert or update on public.deliverability_policies
for each row execute function public._audit_policy_updated();

-- Email sent
create or replace function public._audit_email_sent()
returns trigger language plpgsql as $$
begin
  perform public.insert_audit(
    NEW.campaign_id, 
    'email_sent', 
    'send_logs', 
    NEW.id, 
    jsonb_build_object(
      'to', NEW.to_email, 
      'subject', coalesce(NEW.subject_snapshot, NEW.subject)
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_audit_email_sent on public.send_logs;
create trigger trg_audit_email_sent
after insert on public.send_logs
for each row execute function public._audit_email_sent();

-- Reply received
create or replace function public._audit_reply()
returns trigger language plpgsql as $$
declare
  v_campaign_id uuid;
begin
  if NEW.direction in ('in', 'inbound') and NEW.ai_label not in ('ooo','bounce') then
    select t.campaign_id into v_campaign_id 
    from public.inbox_threads t 
    where t.id = NEW.thread_id;
    
    if v_campaign_id is not null then
      perform public.insert_audit(
        v_campaign_id,
        'reply_received',
        'inbox_messages', 
        NEW.id,
        jsonb_build_object('from', NEW.from_email)
      );
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_audit_reply on public.inbox_messages;
create trigger trg_audit_reply
after insert on public.inbox_messages
for each row execute function public._audit_reply();

-- E) Optional daily summary view
create or replace view public.v_audit_summary_daily as
select
  campaign_id,
  date_trunc('day', created_at) as day,
  count(*) as events,
  count(*) filter (where action='email_sent') as sent,
  count(*) filter (where action='reply_received') as replies,
  count(*) filter (where action='invite_created') as invites
from public.audit_logs
group by 1,2;

