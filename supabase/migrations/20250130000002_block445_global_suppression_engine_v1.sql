-- Block 445 — Global Suppression Engine v1
-- Enterprise-grade safety + compliance suppression system
-- Workspace-scoped suppression lists with auto-sync from multiple sources

-- ============================================================================
-- 1️⃣ SUPABASE SCHEMA — Suppression Tables
-- ============================================================================

-- A) Email Suppression Table
create table if not exists public.email_suppression (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  reason text,
  source text not null check (source in ('unsubscribe', 'bounce', 'spam', 'manual', 'reply', 'import')),
  created_at timestamptz default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (workspace_id, email)
);

create index if not exists idx_email_suppression_workspace_email on public.email_suppression(workspace_id, email);
create index if not exists idx_email_suppression_email on public.email_suppression(email);
create index if not exists idx_email_suppression_source on public.email_suppression(source);
create index if not exists idx_email_suppression_reason on public.email_suppression(reason);

-- B) Domain Suppression Table
create table if not exists public.domain_suppression (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  domain text not null,
  reason text,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (workspace_id, domain)
);

create index if not exists idx_domain_suppression_workspace_domain on public.domain_suppression(workspace_id, domain);
create index if not exists idx_domain_suppression_domain on public.domain_suppression(domain);

-- ============================================================================
-- 2️⃣ AUTO-ADD SUPPRESSION ENTRIES
-- ============================================================================

-- Function: Add email to suppression list
create or replace function public.add_email_suppression(
  p_workspace_id uuid,
  p_email text,
  p_reason text default null,
  p_source text default 'manual',
  p_created_by uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_domain text;
begin
  -- Normalize email
  p_email := lower(trim(p_email));
  
  -- Extract domain
  v_domain := split_part(p_email, '@', 2);
  
  -- Insert email suppression
  insert into public.email_suppression (
    workspace_id,
    email,
    reason,
    source,
    created_by
  )
  values (
    p_workspace_id,
    p_email,
    p_reason,
    p_source,
    p_created_by
  )
  on conflict (workspace_id, email) do update
    set reason = coalesce(excluded.reason, email_suppression.reason),
        source = excluded.source
  returning id into v_id;
  
  -- Log activity
  perform public.log_suppression_activity(
    p_workspace_id,
    'email_suppressed',
    p_email,
    p_reason,
    p_source,
    p_created_by
  );
  
  -- Remove from active queues
  perform public.remove_suppressed_from_queues(p_workspace_id, p_email);
  
  return v_id;
end;
$$;

-- Function: Add domain to suppression list
create or replace function public.add_domain_suppression(
  p_workspace_id uuid,
  p_domain text,
  p_reason text default null,
  p_created_by uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Normalize domain
  p_domain := lower(trim(p_domain));
  
  -- Insert domain suppression
  insert into public.domain_suppression (
    workspace_id,
    domain,
    reason,
    created_by
  )
  values (
    p_workspace_id,
    p_domain,
    p_reason,
    p_created_by
  )
  on conflict (workspace_id, domain) do nothing
  returning id into v_id;
  
  -- Log activity
  perform public.log_suppression_activity(
    p_workspace_id,
    'domain_suppressed',
    p_domain,
    p_reason,
    'manual',
    p_created_by
  );
  
  -- Remove all emails from this domain from active queues
  perform public.remove_suppressed_domain_from_queues(p_workspace_id, p_domain);
  
  return v_id;
end;
$$;

-- ============================================================================
-- 3️⃣ PREVENT SENDING TO SUPPRESSED ADDRESSES
-- ============================================================================

-- Function: Check if email is suppressed
create or replace function public.is_email_suppressed(
  p_workspace_id uuid,
  p_email text
) returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.email_suppression
    where workspace_id = p_workspace_id
      and email = lower(trim(p_email))
  )
  or exists (
    select 1
    from public.domain_suppression
    where workspace_id = p_workspace_id
      and domain = lower(split_part(p_email, '@', 2))
  );
$$;

-- Function: Check if domain is suppressed
create or replace function public.is_domain_suppressed(
  p_workspace_id uuid,
  p_domain text
) returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.domain_suppression
    where workspace_id = p_workspace_id
      and domain = lower(trim(p_domain))
  );
$$;

-- Trigger: Prevent suppressed emails from entering send_queue
create or replace function public.prevent_suppressed_enqueue()
returns trigger
language plpgsql
as $$
declare
  v_workspace_id uuid;
  v_email text;
begin
  -- Get workspace_id and email
  select l.workspace_id, l.email
  into v_workspace_id, v_email
  from public.leads l
  where l.id = new.lead_id;
  
  if v_workspace_id is null or v_email is null then
    return new;
  end if;
  
  -- Check if suppressed
  if public.is_email_suppressed(v_workspace_id, v_email) then
    raise exception 'Email % is suppressed and cannot be queued', v_email;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_prevent_suppressed_enqueue on public.send_queue;
create trigger trg_prevent_suppressed_enqueue
before insert on public.send_queue
for each row
execute function public.prevent_suppressed_enqueue();

-- ============================================================================
-- 4️⃣ REMOVE SUPPRESSED LEADS FROM ACTIVE QUEUES
-- ============================================================================

-- Function: Remove suppressed email from all queues
create or replace function public.remove_suppressed_from_queues(
  p_workspace_id uuid,
  p_email text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_ids uuid[];
begin
  -- Find all lead IDs with this email
  select array_agg(id)
  into v_lead_ids
  from public.leads
  where workspace_id = p_workspace_id
    and email = lower(trim(p_email));
  
  if v_lead_ids is null or array_length(v_lead_ids, 1) = 0 then
    return;
  end if;
  
  -- Delete from send_queue
  delete from public.send_queue
  where lead_id = any(v_lead_ids)
    and status in ('pending', 'queued', 'scheduled');
  
  -- Update campaign_leads status
  update public.campaign_leads
  set status = 'unsub'
  where lead_id = any(v_lead_ids)
    and status not in ('sent', 'replied');
end;
$$;

-- Function: Remove suppressed domain from all queues
create or replace function public.remove_suppressed_domain_from_queues(
  p_workspace_id uuid,
  p_domain text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_ids uuid[];
begin
  -- Find all lead IDs with emails from this domain
  select array_agg(id)
  into v_lead_ids
  from public.leads
  where workspace_id = p_workspace_id
    and lower(split_part(email, '@', 2)) = lower(trim(p_domain));
  
  if v_lead_ids is null or array_length(v_lead_ids, 1) = 0 then
    return;
  end if;
  
  -- Delete from send_queue
  delete from public.send_queue
  where lead_id = any(v_lead_ids)
    and status in ('pending', 'queued', 'scheduled');
  
  -- Update campaign_leads status
  update public.campaign_leads
  set status = 'unsub'
  where lead_id = any(v_lead_ids)
    and status not in ('sent', 'replied');
end;
$$;

-- Trigger: Auto-remove when suppression is added
create or replace function public.auto_remove_on_suppression()
returns trigger
language plpgsql
as $$
begin
  perform public.remove_suppressed_from_queues(new.workspace_id, new.email);
  return new;
end;
$$;

drop trigger if exists trg_auto_remove_on_suppression on public.email_suppression;
create trigger trg_auto_remove_on_suppression
after insert on public.email_suppression
for each row
execute function public.auto_remove_on_suppression();

-- Trigger: Auto-remove domain emails when domain suppression is added
create or replace function public.auto_remove_domain_on_suppression()
returns trigger
language plpgsql
as $$
begin
  perform public.remove_suppressed_domain_from_queues(new.workspace_id, new.domain);
  return new;
end;
$$;

drop trigger if exists trg_auto_remove_domain_on_suppression on public.domain_suppression;
create trigger trg_auto_remove_domain_on_suppression
after insert on public.domain_suppression
for each row
execute function public.auto_remove_domain_on_suppression();

-- ============================================================================
-- 5️⃣ PREVENT UPLOADING SUPPRESSED LEADS
-- ============================================================================

-- Function: Check and filter suppressed emails during import
create or replace function public.filter_suppressed_emails(
  p_workspace_id uuid,
  p_emails text[]
) returns table (
  email text,
  is_suppressed boolean,
  suppression_reason text,
  suppression_source text
)
language plpgsql
stable
as $$
begin
  return query
  select
    e.email,
    coalesce(es.id is not null, false) as is_suppressed,
    es.reason as suppression_reason,
    es.source as suppression_source
  from unnest(p_emails) as e(email)
  left join public.email_suppression es
    on es.workspace_id = p_workspace_id
    and es.email = lower(trim(e.email))
  left join public.domain_suppression ds
    on ds.workspace_id = p_workspace_id
    and ds.domain = lower(split_part(e.email, '@', 2))
  where es.id is null and ds.id is null; -- Only return non-suppressed
end;
$$;

-- ============================================================================
-- 6️⃣ AUTO-SYNC FROM REPLY INTENT (Block 438 Integration)
-- ============================================================================

-- Function: Auto-suppress from reply intent
create or replace function public.auto_suppress_from_reply_intent(
  p_workspace_id uuid,
  p_email text,
  p_intent text,
  p_lead_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suppression_id uuid;
begin
  -- Only suppress on unsubscribe intent
  if p_intent = 'unsubscribe' then
    v_suppression_id := public.add_email_suppression(
      p_workspace_id,
      p_email,
      'Unsubscribe request',
      'reply',
      null
    );
    
    -- Also update lead status if lead_id provided
    if p_lead_id is not null then
      update public.leads
      set status = 'unsubscribed'
      where id = p_lead_id;
    end if;
  end if;
  
  return v_suppression_id;
end;
$$;

-- ============================================================================
-- 7️⃣ AUTO-SYNC FROM BOUNCE EVENTS
-- ============================================================================

-- Function: Auto-suppress from bounce events
create or replace function public.auto_suppress_from_bounce(
  p_workspace_id uuid,
  p_email text,
  p_bounce_type text,
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suppression_id uuid;
begin
  -- Only suppress hard bounces
  if p_bounce_type = 'hard' or p_bounce_type = 'hard_bounce' then
    v_suppression_id := public.add_email_suppression(
      p_workspace_id,
      p_email,
      coalesce(p_reason, 'Hard bounce'),
      'bounce',
      null
    );
  end if;
  
  return v_suppression_id;
end;
$$;

-- ============================================================================
-- 8️⃣ AUTO-SYNC FROM SPAM COMPLAINTS
-- ============================================================================

-- Function: Auto-suppress from spam complaints
create or replace function public.auto_suppress_from_spam(
  p_workspace_id uuid,
  p_email text,
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suppression_id uuid;
begin
  v_suppression_id := public.add_email_suppression(
    p_workspace_id,
    p_email,
    coalesce(p_reason, 'Spam complaint'),
    'spam',
    null
  );
  
  return v_suppression_id;
end;
$$;

-- ============================================================================
-- 9️⃣ ACTIVITY LOGGING
-- ============================================================================

-- Function: Log suppression activity
create or replace function public.log_suppression_activity(
  p_workspace_id uuid,
  p_event_type text,
  p_entity text,
  p_reason text default null,
  p_source text default null,
  p_created_by uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Log to workspace_activity if table exists
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'workspace_activity'
  ) then
    insert into public.workspace_activity (
      workspace_id,
      actor_id,
      event_type,
      description,
      metadata,
      created_at
    )
    values (
      p_workspace_id,
      p_created_by,
      p_event_type,
      case
        when p_event_type = 'email_suppressed' then
          format('SmartSend suppressed %s (reason: %s)', p_entity, coalesce(p_reason, 'unknown'))
        when p_event_type = 'domain_suppressed' then
          format('Admin suppressed domain: @%s', p_entity)
        else
          format('Suppression event: %s', p_event_type)
      end,
      jsonb_build_object(
        'entity', p_entity,
        'reason', p_reason,
        'source', p_source
      ),
      now()
    )
    on conflict do nothing;
  end if;
  
  -- Also log to activity_log if it exists
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'activity_log'
  ) then
    insert into public.activity_log (
      account_id,
      action,
      entity_type,
      entity_name,
      details,
      created_at
    )
    select
      wm.user_id as account_id,
      'suppress'::public.audit_action,
      case when p_event_type like '%email%' then 'email' else 'domain' end,
      p_entity,
      jsonb_build_object(
        'workspace_id', p_workspace_id,
        'reason', p_reason,
        'source', p_source,
        'event_type', p_event_type
      ),
      now()
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.role in ('owner', 'admin')
    limit 1
    on conflict do nothing;
  end if;
end;
$$;

-- ============================================================================
-- 🔟 ROUTING ENGINE SYNERGY (Block 434 Integration)
-- ============================================================================

-- Function: Check if lead should be excluded from routing
create or replace function public.should_exclude_from_routing(
  p_workspace_id uuid,
  p_email text
) returns boolean
language sql
stable
as $$
  select public.is_email_suppressed(p_workspace_id, p_email);
$$;

-- ============================================================================
-- 1️⃣1️⃣ AUTO-PAUSE SYNERGY (Block 437 Integration)
-- ============================================================================

-- Function: Check suppression spike for auto-pause
create or replace function public.check_suppression_spike(
  p_workspace_id uuid,
  p_hours int default 24
) returns table (
  suppression_count bigint,
  unsubscribe_count bigint,
  bounce_count bigint,
  spam_count bigint
)
language sql
stable
as $$
  select
    count(*) as suppression_count,
    count(*) filter (where source = 'unsubscribe') as unsubscribe_count,
    count(*) filter (where source = 'bounce') as bounce_count,
    count(*) filter (where source = 'spam') as spam_count
  from public.email_suppression
  where workspace_id = p_workspace_id
    and created_at >= now() - (p_hours || ' hours')::interval;
$$;

-- ============================================================================
-- 1️⃣2️⃣ RLS POLICIES
-- ============================================================================

alter table public.email_suppression enable row level security;
alter table public.domain_suppression enable row level security;

-- Policy: Workspace members can read suppressions
create policy "email_suppression_read"
on public.email_suppression
for select
using (
  exists (
    select 1 from public.workspace_members
    where workspace_id = email_suppression.workspace_id
      and user_id = auth.uid()
  )
);

-- Policy: Admins can manage email suppressions
create policy "email_suppression_admin"
on public.email_suppression
for all
using (
  exists (
    select 1 from public.workspace_members
    where workspace_id = email_suppression.workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.workspace_members
    where workspace_id = email_suppression.workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  )
);

-- Policy: Workspace members can read domain suppressions
create policy "domain_suppression_read"
on public.domain_suppression
for select
using (
  exists (
    select 1 from public.workspace_members
    where workspace_id = domain_suppression.workspace_id
      and user_id = auth.uid()
  )
);

-- Policy: Admins can manage domain suppressions
create policy "domain_suppression_admin"
on public.domain_suppression
for all
using (
  exists (
    select 1 from public.workspace_members
    where workspace_id = domain_suppression.workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.workspace_members
    where workspace_id = domain_suppression.workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  )
);

-- Service role full access
grant all on public.email_suppression to service_role;
grant all on public.domain_suppression to service_role;
grant execute on function public.add_email_suppression(uuid, text, text, text, uuid) to service_role, authenticated;
grant execute on function public.add_domain_suppression(uuid, text, text, uuid) to service_role, authenticated;
grant execute on function public.is_email_suppressed(uuid, text) to service_role, authenticated;
grant execute on function public.is_domain_suppressed(uuid, text) to service_role, authenticated;
grant execute on function public.auto_suppress_from_reply_intent(uuid, text, text, uuid) to service_role;
grant execute on function public.auto_suppress_from_bounce(uuid, text, text, text) to service_role;
grant execute on function public.auto_suppress_from_spam(uuid, text, text) to service_role;
grant execute on function public.filter_suppressed_emails(uuid, text[]) to service_role, authenticated;
grant execute on function public.remove_suppressed_from_queues(uuid, text) to service_role;
grant execute on function public.remove_suppressed_domain_from_queues(uuid, text) to service_role;
grant execute on function public.check_suppression_spike(uuid, int) to service_role, authenticated;
grant execute on function public.should_exclude_from_routing(uuid, text) to service_role, authenticated;

-- ============================================================================
-- 1️⃣3️⃣ VIEWS FOR UI
-- ============================================================================

-- View: Email suppression summary
create or replace view public.v_email_suppression_summary as
select
  workspace_id,
  count(*) as total_suppressed,
  count(*) filter (where source = 'unsubscribe') as unsubscribe_count,
  count(*) filter (where source = 'bounce') as bounce_count,
  count(*) filter (where source = 'spam') as spam_count,
  count(*) filter (where source = 'manual') as manual_count,
  count(*) filter (where source = 'reply') as reply_count,
  count(*) filter (where created_at >= now() - interval '24 hours') as suppressed_last_24h
from public.email_suppression
group by workspace_id;

-- View: Domain suppression summary
create or replace view public.v_domain_suppression_summary as
select
  workspace_id,
  count(*) as total_domains_suppressed,
  count(*) filter (where created_at >= now() - interval '24 hours') as suppressed_last_24h
from public.domain_suppression
group by workspace_id;

-- Grant access to views
grant select on public.v_email_suppression_summary to authenticated, service_role;
grant select on public.v_domain_suppression_summary to authenticated, service_role;

-- ============================================================================
-- Block 445 Complete
-- ============================================================================

