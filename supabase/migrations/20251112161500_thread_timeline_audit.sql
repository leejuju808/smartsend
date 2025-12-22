-- Thread timeline audit logging and RPC helpers

-- Ensure audit_logs can capture account scoped events
alter table public.audit_logs
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;

-- Ensure profiles carry account linkage
alter table public.profiles
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists idx_profiles_account on public.profiles(account_id);

-- Allow thread/lead entity types for inbox actions
alter table public.audit_logs
  drop constraint if exists audit_logs_entity_type_check;

alter table public.audit_logs
  add constraint audit_logs_entity_type_check check (
    entity_type is null
    or entity_type in (
      'campaign', 'template', 'queue', 'share', 'billing', 'settings',
      'thread', 'lead'
    )
  );

-- Permit new inbox actions in audit logs
alter table public.audit_logs
  drop constraint if exists audit_logs_action_check;

alter table public.audit_logs
  add constraint audit_logs_action_check check (action in (
    'share.add', 'share.update', 'share.remove',
    'invite.create', 'invite.accept', 'invite.expire',
    'auto.defer_daily_cap',
    'user.bulk_close', 'user.bulk_reopen', 'user.bulk_assign',
    'user.bulk_clear_label', 'user.bulk_apply_label',
    'auto.cancel_followups',
    'snooze', 'unpause', 'auto_resume', 'mute', 'unmute', 'detect_intent'
  ));

-- Fast filter for thread timeline lookups
create index if not exists idx_audit_logs_entity_recent
  on public.audit_logs(entity_type, entity_id, created_at desc);

-- RPC: unmute a lead and record audit entry
create or replace function public.unmute_lead(
  p_lead_id uuid,
  p_account_id uuid,
  p_actor_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  update public.leads
     set is_muted = false,
         updated_at = v_now
   where id = p_lead_id;

  insert into public.audit_logs(account_id, actor_id, entity_type, entity_id, action, meta)
  values(p_account_id, p_actor_id, 'lead', p_lead_id, 'unmute', '{}'::jsonb);
end;
$$;

-- RPC: snooze a thread for N days
create or replace function public.snooze_thread(
  p_thread_id uuid,
  p_days int,
  p_account_id uuid,
  p_actor_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resume_at timestamptz := now() + make_interval(days => greatest(p_days, 0));
  v_now timestamptz := now();
begin
  update public.threads
     set auto_paused = true,
         resume_at   = v_resume_at,
         updated_at  = v_now
   where id = p_thread_id;

  insert into public.audit_logs(account_id, actor_id, entity_type, entity_id, action, meta, thread_id)
  values(
    p_account_id,
    p_actor_id,
    'thread',
    p_thread_id,
    'snooze',
    jsonb_build_object('days', p_days, 'resume_at', v_resume_at),
    p_thread_id
  );
end;
$$;

-- RPC: manually unpause a thread
create or replace function public.unpause_thread(
  p_thread_id uuid,
  p_account_id uuid,
  p_actor_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  update public.threads
     set auto_paused = false,
         resume_at   = null,
         updated_at  = v_now
   where id = p_thread_id;

  insert into public.audit_logs(account_id, actor_id, entity_type, entity_id, action, meta, thread_id)
  values(p_account_id, p_actor_id, 'thread', p_thread_id, 'unpause', '{}'::jsonb, p_thread_id);
end;
$$;

-- RPC: auto-unpause due threads (cron helper)
create or replace function public.unpause_due_threads()
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select
      t.id,
      c.account_id
    from public.threads t
    left join public.campaigns c on c.id = t.campaign_id
    where t.auto_paused = true
      and t.resume_at is not null
      and t.resume_at <= now()
  loop
    update public.threads
       set auto_paused = false,
           resume_at   = null,
           updated_at  = now()
     where id = r.id;

    insert into public.audit_logs(account_id, actor_id, entity_type, entity_id, action, meta, thread_id)
    values(r.account_id, null, 'thread', r.id, 'auto_resume', '{}'::jsonb, r.id);

    return next r.id;
  end loop;

  return;
end;
$$;

-- Compact timeline view for thread activity
create or replace view public.v_thread_timeline as
select
  al.created_at,
  al.action as kind,
  al.meta,
  al.actor_id,
  'audit'::text as source,
  coalesce(al.thread_id, al.entity_id) as thread_id
from public.audit_logs al
where al.entity_type = 'thread'
   or (al.entity_type is null and al.thread_id is not null)

union all

select
  rd.created_at,
  'detect_intent'::text as kind,
  jsonb_build_object('intent', rd.intent, 'subtype', rd.subtype, 'confidence', rd.confidence) as meta,
  null::uuid as actor_id,
  'detection'::text as source,
  rd.thread_id
from public.reply_detections rd;


