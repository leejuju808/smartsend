-- Activity Log System

-- 1) Audit action enum (idempotent)
do $$
begin
  perform 1
    from pg_type
   where typname = 'audit_action'
     and typnamespace = 'public'::regnamespace;

  if not found then
    create type public.audit_action as enum (
      'create','update','delete','merge',
      'send','schedule','cancel','retry',
      'login','invite','accept','role_change',
      'suppress','unsuppress','pause','resume'
    );
  end if;
end;
$$;

-- 2) Append-only activity log table
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid,
  campaign_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  action public.audit_action not null,
  entity_type text not null,
  entity_id uuid,
  entity_name text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists idx_activity_created on public.activity_log(created_at desc);
create index if not exists idx_activity_scope on public.activity_log(account_id, campaign_id, action);
create index if not exists idx_activity_entity on public.activity_log(entity_type, entity_id);

-- 3) Helper to append activity
create or replace function public.log_activity(
  p_account uuid,
  p_campaign uuid,
  p_actor uuid,
  p_actor_role text,
  p_action public.audit_action,
  p_entity_type text,
  p_entity_id uuid,
  p_entity_name text,
  p_details jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
begin
  insert into public.activity_log(
    account_id,
    campaign_id,
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    entity_name,
    details
  )
  values (
    p_account,
    p_campaign,
    p_actor,
    p_actor_role,
    p_action,
    p_entity_type,
    p_entity_id,
    p_entity_name,
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into rid;

  return rid;
end;
$$;

-- 4) CSV export view with stable columns
create or replace view public.v_activity_export as
select
  id,
  created_at,
  coalesce(account_id::text, '') as account_id,
  coalesce(campaign_id::text, '') as campaign_id,
  coalesce(actor_user_id::text, '') as actor_user_id,
  coalesce(actor_role, '') as actor_role,
  action::text as action,
  entity_type,
  coalesce(entity_id::text, '') as entity_id,
  coalesce(entity_name, '') as entity_name,
  details::text as details
from public.activity_log;

-- 5) Helpers for triggers
create or replace function public.uid()
returns uuid
language sql
stable
as $$
  select auth.uid()
$$;

create or replace function public.json_diff(old jsonb, new jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_object_agg(
      key,
      jsonb_build_object('from', old -> key, 'to', new -> key)
    )
    filter (where old -> key is distinct from new -> key),
    '{}'::jsonb
  )
  from (
    select key from jsonb_object_keys(coalesce(old, '{}'::jsonb))
    union
    select key from jsonb_object_keys(coalesce(new, '{}'::jsonb))
  ) s
$$;

-- 6) Leads trigger
create or replace function public.trg_log_leads()
returns trigger
language plpgsql
as $$
declare
  role_text text;
begin
  select a.role
    into role_text
    from public.v_campaign_access a
   where a.user_id = public.uid()
     and a.campaign_id = coalesce(new.campaign_id, old.campaign_id)
   limit 1;

  if TG_OP = 'INSERT' then
    perform public.log_activity(
      null,
      new.campaign_id,
      public.uid(),
      role_text,
      'create',
      'lead',
      new.id,
      new.email,
      to_jsonb(new)
    );
    return new;
  elsif TG_OP = 'UPDATE' then
    perform public.log_activity(
      null,
      new.campaign_id,
      public.uid(),
      role_text,
      'update',
      'lead',
      new.id,
      new.email,
      public.json_diff(to_jsonb(old), to_jsonb(new))
    );
    return new;
  else
    perform public.log_activity(
      null,
      old.campaign_id,
      public.uid(),
      role_text,
      'delete',
      'lead',
      old.id,
      old.email,
      to_jsonb(old)
    );
    return old;
  end if;
end;
$$;

drop trigger if exists t_log_leads on public.leads;
create trigger t_log_leads
after insert or update or delete on public.leads
for each row execute function public.trg_log_leads();

-- 7) Messages trigger
create or replace function public.trg_log_messages()
returns trigger
language plpgsql
as $$
declare
  role_text text;
  campaign uuid;
begin
  select t.campaign_id, a.role
    into campaign, role_text
    from public.threads t
    left join public.v_campaign_access a
      on a.campaign_id = t.campaign_id
     and a.user_id = public.uid()
   where t.id = coalesce(new.thread_id, old.thread_id)
   limit 1;

  if TG_OP = 'INSERT' then
    perform public.log_activity(
      null,
      campaign,
      public.uid(),
      role_text,
      case when new.direction = 'outbound' then 'send' else 'create' end,
      'message',
      new.id,
      left(coalesce(new.subject, ''), 120),
      (to_jsonb(new) - 'body_html' - 'body_text')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists t_log_messages on public.messages;
create trigger t_log_messages
after insert on public.messages
for each row execute function public.trg_log_messages();

-- 8) Follow-up state trigger
create or replace function public.trg_log_followup_state()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' then
    perform public.log_activity(
      null,
      new.campaign_id,
      public.uid(),
      null,
      case
        when new.is_done and not old.is_done then 'pause'
        else 'update'
      end,
      'sequence',
      new.sequence_id,
      null,
      public.json_diff(to_jsonb(old), to_jsonb(new))
    );
  end if;

  return new;
end;
$$;

drop trigger if exists t_log_followup_state on public.followup_state;
create trigger t_log_followup_state
after update on public.followup_state
for each row execute function public.trg_log_followup_state();

-- 9) Lead merge trigger
create or replace function public.log_lead_merge()
returns trigger
language plpgsql
as $$
begin
  perform public.log_activity(
    null,
    null,
    public.uid(),
    null,
    'merge',
    'lead',
    new.master_lead_id,
    null,
    jsonb_build_object(
      'merged_lead_id', new.merged_lead_id,
      'reason', new.reason
    )
  );
  return new;
end;
$$;

drop trigger if exists t_log_lead_merge on public.lead_merges;
create trigger t_log_lead_merge
after insert on public.lead_merges
for each row execute function public.log_lead_merge();

-- 10) Row level security
alter table public.activity_log enable row level security;

drop policy if exists activity_select on public.activity_log;
create policy activity_select on public.activity_log
for select
using (
  (campaign_id is null and account_id is null)
  or exists (
    select 1
      from public.v_campaign_access a
     where a.user_id = public.uid()
       and (
         a.campaign_id = public.activity_log.campaign_id
         or a.account_id = public.activity_log.account_id
       )
  )
);

-- Ensure only privileged roles can insert/update/delete directly (append-only via helpers)
revoke all on public.activity_log from public;
grant select on public.activity_log to authenticated;
grant select on public.activity_log to service_role;
grant insert, update, delete on public.activity_log to service_role;
grant execute on function public.log_activity(
  uuid,
  uuid,
  uuid,
  text,
  public.audit_action,
  text,
  uuid,
  text,
  jsonb
) to authenticated, service_role;

-- 11) Campaign invite helpers log activity
drop function if exists public.create_campaign_invite(uuid, citext, text);
drop function if exists public.create_campaign_invite(uuid, text, text);

create or replace function public.create_campaign_invite(
  p_campaign uuid,
  p_email citext,
  p_role text default 'viewer'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_id uuid;
  v_role public.campaign_role;
  v_account uuid;
  v_attempts int := 0;
  v_actor_role text;
begin
  if p_role not in ('viewer','editor') then
    raise exception 'Invalid role';
  end if;

  select account_id
    into v_account
    from public.campaigns
   where id = p_campaign;

  if v_account is null then
    raise exception 'Campaign not found';
  end if;

  if not exists (
    select 1
      from public.campaign_members me
     where me.campaign_id = p_campaign
       and me.user_id = auth.uid()
       and me.role = 'owner'
  ) and not exists (
    select 1
      from public.campaigns c
      join public.team_members tm
        on tm.account_id = c.account_id
     where c.id = p_campaign
       and tm.user_id = auth.uid()
       and tm.role in ('owner','admin')
  ) then
    raise exception 'Not authorized';
  end if;

  v_role := p_role::public.campaign_role;

  loop
    v_attempts := v_attempts + 1;
    v_token := public.gen_token(16);

    begin
      insert into public.campaign_invites (campaign_id, invited_email, role, token)
      values (p_campaign, lower(p_email)::citext, v_role, v_token)
      on conflict (campaign_id, invited_email) do update
        set role = excluded.role,
            token = excluded.token,
            created_at = now(),
            expires_at = now() + interval '7 days',
            accepted_by = null,
            accepted_at = null
      returning id into v_id;

      exit;
    exception
      when unique_violation then
        if v_attempts >= 5 then
          raise exception 'Failed to generate unique invite token';
        end if;
        -- retry
    end;
  end loop;

  select role
    into v_actor_role
    from public.v_campaign_access
   where user_id = auth.uid()
     and campaign_id = p_campaign
   limit 1;

  perform public.log_activity(
    v_account,
    p_campaign,
    auth.uid(),
    v_actor_role,
    'invite',
    'member',
    v_id,
    lower(p_email)::text,
    jsonb_build_object(
      'email', lower(p_email)::text,
      'role', v_role::text
    )
  );

  return v_id;
end
$$;

grant execute on function public.create_campaign_invite(uuid, citext, text) to authenticated;

drop function if exists public.accept_campaign_invite(text);

create or replace function public.accept_campaign_invite(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_user record;
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select i.*, c.account_id
    into v_inv
    from public.campaign_invites i
    join public.campaigns c
      on c.id = i.campaign_id
   where i.token = p_token
     and i.expires_at > now()
     and i.accepted_at is null
   for update;

  if not found then
    raise exception 'Invite invalid or expired';
  end if;

  select id, email
    into v_user
    from auth.users
   where id = auth.uid();

  if v_user.id is null then
    raise exception 'User not found';
  end if;

  if lower(coalesce(v_user.email, '')) <> lower(v_inv.invited_email::text) then
    raise exception 'Invite email mismatch';
  end if;

  v_ok := public.ensure_seat_available(v_inv.account_id);
  if not v_ok then
    raise exception 'No available seats. Contact owner to upgrade seats.'
      using errcode = '23514';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_inv.campaign_id, v_user.id, v_inv.role)
  on conflict (campaign_id, user_id) do update
    set role = excluded.role,
        created_at = least(campaign_members.created_at, now());

  update public.campaign_invites
     set accepted_by = v_user.id,
         accepted_at = now()
   where id = v_inv.id;

  perform public.log_activity(
    v_inv.account_id,
    v_inv.campaign_id,
    v_user.id,
    v_inv.role::text,
    'accept',
    'member',
    v_user.id,
    coalesce(v_user.email, '')::text,
    jsonb_build_object(
      'email', coalesce(v_user.email, '')::text,
      'role', v_inv.role::text
    )
  );

  return true;
end
$$;

grant execute on function public.accept_campaign_invite(text) to authenticated;

-- 12) Suppression logging
create or replace function public.trg_log_lead_suppressions()
returns trigger
language plpgsql
as $$
declare
  v_account uuid;
  v_role text;
  v_email text;
begin
  if TG_OP = 'INSERT' then
    if new.campaign_id is not null then
      select account_id into v_account from public.campaigns where id = new.campaign_id;
      select role
        into v_role
        from public.v_campaign_access
       where user_id = public.uid()
         and campaign_id = new.campaign_id
       limit 1;
    end if;

    select email into v_email from public.leads where id = new.lead_id;

    perform public.log_activity(
      v_account,
      new.campaign_id,
      public.uid(),
      v_role,
      'suppress',
      'lead',
      new.lead_id,
      v_email,
      jsonb_build_object(
        'reason', new.reason,
        'note', new.note
      )
    );
    return new;
  elsif TG_OP = 'DELETE' then
    if old.campaign_id is not null then
      select account_id into v_account from public.campaigns where id = old.campaign_id;
      select role
        into v_role
        from public.v_campaign_access
       where user_id = public.uid()
         and campaign_id = old.campaign_id
       limit 1;
    end if;

    select email into v_email from public.leads where id = old.lead_id;

    perform public.log_activity(
      v_account,
      old.campaign_id,
      public.uid(),
      v_role,
      'unsuppress',
      'lead',
      old.lead_id,
      v_email,
      jsonb_build_object(
        'reason', old.reason,
        'note', old.note
      )
    );
    return old;
  end if;

  return new;
end
$$;

drop trigger if exists t_log_lead_suppressions on public.lead_suppressions;
create trigger t_log_lead_suppressions
after insert or delete on public.lead_suppressions
for each row execute function public.trg_log_lead_suppressions();

-- 13) OOO schedule logging
create or replace function public.trg_log_ooo_schedules()
returns trigger
language plpgsql
as $$
declare
  v_thread record;
  v_role text;
begin
  select
    t.campaign_id,
    t.lead_id,
    c.account_id,
    l.email
  into v_thread
  from public.threads t
  left join public.campaigns c on c.id = t.campaign_id
  left join public.leads l on l.id = t.lead_id
  where t.id = coalesce(new.thread_id, old.thread_id);

  if TG_OP = 'INSERT' then
    if v_thread.campaign_id is not null then
      select role
        into v_role
        from public.v_campaign_access
       where user_id = public.uid()
         and campaign_id = v_thread.campaign_id
       limit 1;
    end if;

    perform public.log_activity(
      v_thread.account_id,
      v_thread.campaign_id,
      public.uid(),
      v_role,
      'pause',
      'thread',
      new.thread_id,
      v_thread.email,
      jsonb_build_object(
        'return_at', new.return_at,
        'source_event_id', new.detected_from_event
      )
    );
    return new;
  elsif TG_OP = 'DELETE' then
    if v_thread.campaign_id is not null then
      select role
        into v_role
        from public.v_campaign_access
       where user_id = public.uid()
         and campaign_id = v_thread.campaign_id
       limit 1;
    end if;

    perform public.log_activity(
      v_thread.account_id,
      v_thread.campaign_id,
      public.uid(),
      v_role,
      'resume',
      'thread',
      old.thread_id,
      v_thread.email,
      jsonb_build_object(
        'return_at', old.return_at,
        'source_event_id', old.detected_from_event
      )
    );
    return old;
  end if;

  return new;
end
$$;

drop trigger if exists t_log_ooo_schedules on public.ooo_schedules;
create trigger t_log_ooo_schedules
after insert or delete on public.ooo_schedules
for each row execute function public.trg_log_ooo_schedules();

