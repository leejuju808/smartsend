-- Block 453 — Compliance Layer v1
-- GDPR • CAN-SPAM • CASL • Global Suppression Enforcement • Auto Footers • Data Retention Rules
-- Makes SmartSend legally safe and enterprise-ready

-- ============================================================================
-- 1️⃣ SCHEMA ADDITIONS — Lead-Level Compliance Flags
-- ============================================================================

-- Add compliance columns to leads table
alter table if exists public.leads
  add column if not exists gdpr_erased boolean not null default false,
  add column if not exists can_email boolean not null default true,
  add column if not exists expressed_consent boolean not null default false,
  add column if not exists consent_timestamp timestamptz,
  add column if not exists legal_basis text,
  add column if not exists data_retention_expires_at timestamptz;

-- Indexes for compliance queries
create index if not exists idx_leads_gdpr_erased on public.leads(workspace_id, gdpr_erased) where gdpr_erased = true;
create index if not exists idx_leads_can_email on public.leads(workspace_id, can_email) where can_email = false;
create index if not exists idx_leads_consent_expires on public.leads(workspace_id, consent_timestamp) where expressed_consent = true;
create index if not exists idx_leads_retention_expires on public.leads(workspace_id, data_retention_expires_at) where data_retention_expires_at is not null;

-- ============================================================================
-- 2️⃣ SCHEMA ADDITIONS — Workspace-Level Compliance Settings
-- ============================================================================

-- Add compliance columns to workspaces table
alter table if exists public.workspaces
  add column if not exists physical_address text,
  add column if not exists auto_footer boolean not null default true,
  add column if not exists require_consent boolean not null default false,
  add column if not exists data_retention_months int default null check (data_retention_months in (6, 12, 24) or data_retention_months is null),
  add column if not exists compliance_health_score int default 100 check (compliance_health_score >= 0 and compliance_health_score <= 100);

-- Index for compliance queries
create index if not exists idx_workspaces_compliance on public.workspaces(id, auto_footer, require_consent, physical_address);

-- ============================================================================
-- 3️⃣ GDPR "RIGHT TO ERASURE" WORKFLOW
-- ============================================================================

-- Function: Erase lead data per GDPR request
create or replace function public.gdpr_erase_lead(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_actor_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_workspace_id uuid;
begin
  -- Get lead info
  select email, workspace_id
  into v_email, v_workspace_id
  from public.leads
  where id = p_lead_id
    and workspace_id = p_workspace_id;
  
  if v_email is null then
    raise exception 'Lead not found';
  end if;
  
  -- A. Set compliance flags
  update public.leads
  set
    gdpr_erased = true,
    can_email = false,
    -- Erase PII fields
    email = 'erased-' || gen_random_uuid()::text || '@gdpr-erased.local',
    name = null,
    first_name = null,
    last_name = null,
    phone = null,
    company = null,
    title = null,
    linkedin = null,
    -- Clear custom fields (PII only - keep non-PII metadata)
    custom = jsonb_build_object('gdpr_erased', true, 'erased_at', now())
  where id = p_lead_id;
  
  -- B. Remove from all campaigns
  delete from public.campaign_leads
  where lead_id = p_lead_id
    and status not in ('sent', 'replied');
  
  -- C. Remove from sequences
  delete from public.sequence_leads
  where lead_id = p_lead_id;
  
  -- D. Remove from send_queue
  delete from public.send_queue
  where lead_id = p_lead_id
    and status in ('pending', 'queued', 'scheduled');
  
  -- E. Remove from routing flows (if table exists)
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'routing_flows'
  ) then
    delete from public.routing_flows
    where lead_id = p_lead_id;
  end if;
  
  -- F. Remove from broadcast recipients (if table exists)
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'broadcast_recipients'
  ) then
    delete from public.broadcast_recipients
    where lead_id = p_lead_id;
  end if;
  
  -- G. Add to global suppression
  perform public.add_email_suppression(
    p_workspace_id,
    v_email,
    'GDPR erasure request',
    'manual',
    p_actor_id
  );
  
  -- H. Log activity
  perform public.log_compliance_activity(
    p_workspace_id,
    'gdpr_erased',
    p_lead_id,
    jsonb_build_object(
      'email', v_email,
      'actor_id', p_actor_id,
      'timestamp', now()
    )
  );
end;
$$;

-- ============================================================================
-- 4️⃣ CASL HANDLING (Canada)
-- ============================================================================

-- Function: Check CASL consent requirement
create or replace function public.check_casl_consent(
  p_workspace_id uuid,
  p_lead_id uuid
) returns boolean
language plpgsql
stable
as $$
declare
  v_require_consent boolean;
  v_expressed_consent boolean;
  v_consent_timestamp timestamptz;
  v_consent_expired boolean;
begin
  -- Get workspace consent requirement
  select require_consent
  into v_require_consent
  from public.workspaces
  where id = p_workspace_id;
  
  -- If workspace doesn't require consent, allow send
  if not coalesce(v_require_consent, false) then
    return true;
  end if;
  
  -- Get lead consent status
  select expressed_consent, consent_timestamp
  into v_expressed_consent, v_consent_timestamp
  from public.leads
  where id = p_lead_id;
  
  -- If no consent, block
  if not coalesce(v_expressed_consent, false) then
    return false;
  end if;
  
  -- CASL requires consent expires after 24 months
  if v_consent_timestamp is not null then
    v_consent_expired := v_consent_timestamp < now() - interval '24 months';
    if v_consent_expired then
      -- Auto-expire consent
      update public.leads
      set expressed_consent = false, consent_timestamp = null
      where id = p_lead_id;
      return false;
    end if;
  end if;
  
  return true;
end;
$$;

-- Function: Record express consent (CASL)
create or replace function public.record_express_consent(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_legal_basis text default 'express_consent'
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.leads
  set
    expressed_consent = true,
    consent_timestamp = now(),
    legal_basis = p_legal_basis,
    can_email = true
  where id = p_lead_id
    and workspace_id = p_workspace_id;
  
  -- Log activity
  perform public.log_compliance_activity(
    p_workspace_id,
    'consent_recorded',
    p_lead_id,
    jsonb_build_object(
      'legal_basis', p_legal_basis,
      'timestamp', now()
    )
  );
end;
$$;

-- ============================================================================
-- 5️⃣ PRE-SEND COMPLIANCE CHECK (CRITICAL)
-- ============================================================================

-- Function: Comprehensive pre-send compliance check
create or replace function public.pre_send_compliance_check(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_email_body text default null,
  p_has_unsubscribe_link boolean default false
) returns jsonb
language plpgsql
stable
as $$
declare
  v_result jsonb := jsonb_build_object('allowed', true, 'errors', jsonb_build_array());
  v_lead record;
  v_workspace record;
  v_suppressed boolean;
  v_casl_ok boolean;
  v_has_footer boolean;
  v_has_unsub boolean;
  v_has_address boolean;
begin
  -- Get lead data
  select
    l.id,
    l.email,
    l.gdpr_erased,
    l.can_email,
    l.expressed_consent,
    l.workspace_id
  into v_lead
  from public.leads l
  where l.id = p_lead_id
    and l.workspace_id = p_workspace_id;
  
  if v_lead.id is null then
    return jsonb_build_object(
      'allowed', false,
      'errors', jsonb_build_array('Lead not found')
    );
  end if;
  
  -- Get workspace compliance settings
  select
    w.auto_footer,
    w.require_consent,
    w.physical_address
  into v_workspace
  from public.workspaces w
  where w.id = p_workspace_id;
  
  -- Check 1: GDPR erasure
  if v_lead.gdpr_erased then
    v_result := jsonb_set(
      v_result,
      '{allowed}',
      'false'::jsonb
    );
    v_result := jsonb_set(
      v_result,
      '{errors}',
      (v_result->'errors') || jsonb_build_array('Lead has been GDPR erased')
    );
  end if;
  
  -- Check 2: can_email flag
  if not v_lead.can_email then
    v_result := jsonb_set(
      v_result,
      '{allowed}',
      'false'::jsonb
    );
    v_result := jsonb_set(
      v_result,
      '{errors}',
      (v_result->'errors') || jsonb_build_array('Lead has opted out (can_email = false)')
    );
  end if;
  
  -- Check 3: Suppressed email/domain
  v_suppressed := public.is_email_suppressed(p_workspace_id, v_lead.email);
  if v_suppressed then
    v_result := jsonb_set(
      v_result,
      '{allowed}',
      'false'::jsonb
    );
    v_result := jsonb_set(
      v_result,
      '{errors}',
      (v_result->'errors') || jsonb_build_array('Email is on global suppression list')
    );
  end if;
  
  -- Check 4: CASL consent (if required)
  v_casl_ok := public.check_casl_consent(p_workspace_id, p_lead_id);
  if not v_casl_ok then
    v_result := jsonb_set(
      v_result,
      '{allowed}',
      'false'::jsonb
    );
    v_result := jsonb_set(
      v_result,
      '{errors}',
      (v_result->'errors') || jsonb_build_array('CASL consent required but not provided or expired')
    );
  end if;
  
  -- Check 5: Footer requirements (if auto_footer enabled)
  if coalesce(v_workspace.auto_footer, true) then
    -- Check if footer exists in body
    v_has_footer := p_email_body is not null and (
      p_email_body ilike '%unsubscribe%' or
      p_email_body ilike '%stop receiving%' or
      p_email_body ilike '%opt-out%'
    );
    
    -- Check if unsubscribe link exists
    v_has_unsub := p_has_unsubscribe_link or (
      p_email_body is not null and (
        p_email_body ilike '%/u/%' or
        p_email_body ilike '%unsubscribe_link%' or
        p_email_body ilike '%{{unsubscribe%'
      )
    );
    
    -- Check if physical address exists
    v_has_address := v_workspace.physical_address is not null and length(trim(v_workspace.physical_address)) > 0;
    
    if not v_has_unsub then
      v_result := jsonb_set(
        v_result,
        '{allowed}',
        'false'::jsonb
      );
      v_result := jsonb_set(
        v_result,
        '{errors}',
        (v_result->'errors') || jsonb_build_array('Missing unsubscribe link (CAN-SPAM requirement)')
      );
    end if;
    
    if not v_has_address then
      v_result := jsonb_set(
        v_result,
        '{allowed}',
        'false'::jsonb
      );
      v_result := jsonb_set(
        v_result,
        '{errors}',
        (v_result->'errors') || jsonb_build_array('Missing physical address (CAN-SPAM requirement)')
      );
    end if;
  end if;
  
  return v_result;
end;
$$;

-- ============================================================================
-- 6️⃣ AUTO-FOOTER INJECTION LOGIC
-- ============================================================================

-- Function: Generate compliance footer
create or replace function public.generate_compliance_footer(
  p_workspace_id uuid,
  p_unsubscribe_link text,
  p_sender_company text default null
) returns text
language plpgsql
stable
as $$
declare
  v_workspace record;
  v_footer text;
begin
  -- Get workspace settings
  select
    w.physical_address,
    w.auto_footer,
    w.name as workspace_name
  into v_workspace
  from public.workspaces w
  where w.id = p_workspace_id;
  
  -- If auto_footer disabled, return empty
  if not coalesce(v_workspace.auto_footer, true) then
    return '';
  end if;
  
  -- Build footer
  v_footer := E'\n\n---\n';
  v_footer := v_footer || 'You are receiving this message because ';
  v_footer := v_footer || coalesce(p_sender_company, v_workspace.workspace_name, 'we');
  v_footer := v_footer || ' attempted to contact you for business purposes.\n\n';
  
  if p_unsubscribe_link is not null then
    v_footer := v_footer || 'To stop receiving messages: ' || p_unsubscribe_link || '\n';
  end if;
  
  if v_workspace.physical_address is not null then
    v_footer := v_footer || 'Physical Address: ' || v_workspace.physical_address || '\n';
  end if;
  
  return v_footer;
end;
$$;

-- Function: Inject footer into email body
create or replace function public.inject_compliance_footer(
  p_workspace_id uuid,
  p_email_body text,
  p_unsubscribe_link text,
  p_sender_company text default null
) returns text
language plpgsql
stable
as $$
declare
  v_footer text;
begin
  -- Generate footer
  v_footer := public.generate_compliance_footer(
    p_workspace_id,
    p_unsubscribe_link,
    p_sender_company
  );
  
  -- Append footer if not already present
  if v_footer is not null and length(v_footer) > 0 then
    -- Check if footer already exists (simple check)
    if p_email_body not ilike '%stop receiving messages%' then
      return p_email_body || v_footer;
    end if;
  end if;
  
  return p_email_body;
end;
$$;

-- ============================================================================
-- 7️⃣ DATA RETENTION RULES
-- ============================================================================

-- Function: Apply data retention rules
create or replace function public.apply_data_retention(
  p_workspace_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention_months int;
  v_expired_count int := 0;
  v_expired_leads uuid[];
begin
  -- Get workspace retention setting
  select data_retention_months
  into v_retention_months
  from public.workspaces
  where id = p_workspace_id;
  
  -- If no retention policy, return
  if v_retention_months is null then
    return 0;
  end if;
  
  -- Find expired leads
  select array_agg(id)
  into v_expired_leads
  from public.leads
  where workspace_id = p_workspace_id
    and data_retention_expires_at is not null
    and data_retention_expires_at < now()
    and gdpr_erased = false;
  
  if v_expired_leads is null or array_length(v_expired_leads, 1) = 0 then
    return 0;
  end if;
  
  -- Clear PII for expired leads
  update public.leads
  set
    email = 'expired-' || gen_random_uuid()::text || '@retention-expired.local',
    name = null,
    first_name = null,
    last_name = null,
    phone = null,
    company = null,
    title = null,
    linkedin = null,
    custom = jsonb_build_object('retention_expired', true, 'expired_at', now())
  where id = any(v_expired_leads);
  
  v_expired_count := array_length(v_expired_leads, 1);
  
  -- Log activity
  perform public.log_compliance_activity(
    p_workspace_id,
    'retention_applied',
    null,
    jsonb_build_object(
      'expired_count', v_expired_count,
      'retention_months', v_retention_months
    )
  );
  
  return v_expired_count;
end;
$$;

-- Function: Set retention expiration on lead creation/update
create or replace function public.set_lead_retention_expiration()
returns trigger
language plpgsql
as $$
declare
  v_retention_months int;
begin
  -- Get workspace retention policy
  select data_retention_months
  into v_retention_months
  from public.workspaces
  where id = new.workspace_id;
  
  -- Set expiration if policy exists and not already set
  if v_retention_months is not null and new.data_retention_expires_at is null then
    new.data_retention_expires_at := now() + (v_retention_months || ' months')::interval;
  end if;
  
  return new;
end;
$$;

-- Trigger: Auto-set retention expiration
drop trigger if exists trg_set_lead_retention on public.leads;
create trigger trg_set_lead_retention
before insert or update on public.leads
for each row
execute function public.set_lead_retention_expiration();

-- ============================================================================
-- 8️⃣ COMPLIANCE HEALTH SCORE CALCULATION
-- ============================================================================

-- Function: Calculate workspace compliance health score
create or replace function public.calculate_compliance_health(
  p_workspace_id uuid
) returns int
language plpgsql
stable
as $$
declare
  v_score int := 100;
  v_workspace record;
begin
  -- Get workspace settings
  select
    w.physical_address,
    w.auto_footer,
    w.require_consent
  into v_workspace
  from public.workspaces w
  where w.id = p_workspace_id;
  
  -- Deduct points for missing requirements
  if v_workspace.physical_address is null or length(trim(v_workspace.physical_address)) = 0 then
    v_score := v_score - 20; -- Missing physical address
  end if;
  
  if not coalesce(v_workspace.auto_footer, true) then
    v_score := v_score - 15; -- Auto-footer disabled
  end if;
  
  -- Check for leads without consent if required
  if coalesce(v_workspace.require_consent, false) then
    if exists (
      select 1 from public.leads
      where workspace_id = p_workspace_id
        and can_email = true
        and expressed_consent = false
        and gdpr_erased = false
    ) then
      v_score := v_score - 10; -- Leads without required consent
    end if;
  end if;
  
  -- Ensure score is between 0 and 100
  v_score := greatest(0, least(100, v_score));
  
  return v_score;
end;
$$;

-- Function: Update compliance health score
create or replace function public.update_compliance_health_score(
  p_workspace_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score int;
begin
  v_score := public.calculate_compliance_health(p_workspace_id);
  
  update public.workspaces
  set compliance_health_score = v_score
  where id = p_workspace_id;
end;
$$;

-- ============================================================================
-- 9️⃣ COMPLIANCE ACTIVITY LOGGING
-- ============================================================================

-- Function: Log compliance activities
create or replace function public.log_compliance_activity(
  p_workspace_id uuid,
  p_event_type text,
  p_lead_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
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
      lead_id,
      type,
      subtype,
      metadata,
      created_at
    )
    values (
      p_workspace_id,
      p_lead_id,
      'compliance',
      p_event_type,
      p_metadata,
      now()
    );
  end if;
  
  -- Also log to activity_log if it exists
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'activity_log'
  ) then
    insert into public.activity_log (
      account_id,
      campaign_id,
      lead_id,
      action,
      entity_type,
      entity_id,
      details,
      created_at
    )
    select
      wm.user_id as account_id,
      null as campaign_id,
      p_lead_id,
      'compliance'::text,
      'compliance',
      p_workspace_id,
      jsonb_build_object(
        'event_type', p_event_type,
        'workspace_id', p_workspace_id,
        'metadata', p_metadata
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
-- 🔟 TRIGGER: PREVENT NON-COMPLIANT SENDS
-- ============================================================================

-- Function: Trigger to check compliance before insert into send_queue
create or replace function public.enforce_compliance_on_send()
returns trigger
language plpgsql
as $$
declare
  v_lead record;
  v_workspace_id uuid;
  v_check_result jsonb;
  v_body text;
begin
  -- Get lead and workspace info
  select l.*, l.workspace_id as ws_id
  into v_lead
  from public.leads l
  where l.id = new.lead_id;
  
  if v_lead.id is null then
    raise exception 'Lead not found';
  end if;
  
  v_workspace_id := v_lead.ws_id;
  
  -- Get email body from payload or body field
  v_body := coalesce(
    new.body_text,
    new.body,
    (new.payload->>'body')::text,
    (new.payload->>'body_text')::text
  );
  
  -- Run compliance check
  v_check_result := public.pre_send_compliance_check(
    v_workspace_id,
    new.lead_id,
    v_body,
    v_body ilike '%unsubscribe%' or v_body ilike '%/u/%'
  );
  
  -- If not allowed, raise exception
  if not (v_check_result->>'allowed')::boolean then
    raise exception 'Compliance check failed: %', 
      array_to_string(
        array(select jsonb_array_elements_text(v_check_result->'errors')),
        '; '
      );
  end if;
  
  -- Inject footer if needed
  if v_body is not null then
    declare
      v_unsub_link text;
      v_footer_body text;
    begin
      -- Extract unsubscribe link if present, or generate one
      -- For now, we'll check if footer injection is needed
      v_footer_body := public.inject_compliance_footer(
        v_workspace_id,
        v_body,
        v_unsub_link,
        null
      );
      
      -- Update body if footer was added
      if v_footer_body != v_body then
        if new.body_text is not null then
          new.body_text := v_footer_body;
        elsif new.body is not null then
          new.body := v_footer_body;
        elsif new.payload is not null then
          new.payload := jsonb_set(
            coalesce(new.payload, '{}'::jsonb),
            '{body}',
            to_jsonb(v_footer_body)
          );
        end if;
      end if;
    end;
  end if;
  
  return new;
end;
$$;

-- Apply trigger to send_queue (if table exists)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'send_queue'
  ) then
    drop trigger if exists trg_enforce_compliance_on_send on public.send_queue;
    create trigger trg_enforce_compliance_on_send
    before insert on public.send_queue
    for each row
    execute function public.enforce_compliance_on_send();
  end if;
end $$;

-- Apply trigger to messages table (if exists)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'messages'
  ) then
    drop trigger if exists trg_enforce_compliance_on_messages on public.messages;
    create trigger trg_enforce_compliance_on_messages
    before insert on public.messages
    for each row
    execute function public.enforce_compliance_on_send();
  end if;
end $$;

-- ============================================================================
-- 1️⃣1️⃣ GDPR DATA EXPORT
-- ============================================================================

-- Function: Export lead data for GDPR request
create or replace function public.export_lead_data(
  p_workspace_id uuid,
  p_lead_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_export jsonb;
begin
  -- Get all lead data
  select to_jsonb(l.*)
  into v_export
  from public.leads l
  where l.id = p_lead_id
    and l.workspace_id = p_workspace_id;
  
  -- Add campaign participation
  v_export := jsonb_set(
    v_export,
    '{campaigns}',
    (
      select jsonb_agg(to_jsonb(c.*))
      from public.campaign_leads cl
      join public.campaigns c on c.id = cl.campaign_id
      where cl.lead_id = p_lead_id
    )
  );
  
  -- Add email history (if table exists)
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'email_logs'
  ) then
    v_export := jsonb_set(
      v_export,
      '{email_history}',
      (
        select jsonb_agg(to_jsonb(el.*))
        from public.email_logs el
        where el.lead_id = p_lead_id
        order by el.created_at desc
        limit 100
      )
    );
  end if;
  
  -- Log export activity
  perform public.log_compliance_activity(
    p_workspace_id,
    'data_exported',
    p_lead_id,
    jsonb_build_object('exported_at', now())
  );
  
  return v_export;
end;
$$;

-- ============================================================================
-- 1️⃣2️⃣ GRANTS AND PERMISSIONS
-- ============================================================================

-- Grant execute permissions
grant execute on function public.gdpr_erase_lead(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.check_casl_consent(uuid, uuid) to authenticated, service_role;
grant execute on function public.record_express_consent(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.pre_send_compliance_check(uuid, uuid, text, boolean) to authenticated, service_role;
grant execute on function public.generate_compliance_footer(uuid, text, text) to authenticated, service_role;
grant execute on function public.inject_compliance_footer(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.apply_data_retention(uuid) to service_role;
grant execute on function public.calculate_compliance_health(uuid) to authenticated, service_role;
grant execute on function public.update_compliance_health_score(uuid) to authenticated, service_role;
grant execute on function public.log_compliance_activity(uuid, text, uuid, jsonb) to authenticated, service_role;
grant execute on function public.export_lead_data(uuid, uuid) to authenticated, service_role;

-- ============================================================================
-- 1️⃣3️⃣ VIEWS FOR COMPLIANCE DASHBOARD
-- ============================================================================

-- View: Compliance summary per workspace
create or replace view public.v_compliance_summary as
select
  w.id as workspace_id,
  w.name as workspace_name,
  w.physical_address,
  w.auto_footer,
  w.require_consent,
  w.data_retention_months,
  w.compliance_health_score,
  count(distinct l.id) filter (where l.gdpr_erased = true) as gdpr_erased_count,
  count(distinct l.id) filter (where l.can_email = false) as cannot_email_count,
  count(distinct l.id) filter (where l.expressed_consent = true) as consented_count,
  count(distinct l.id) filter (where l.expressed_consent = false and l.can_email = true) as missing_consent_count,
  count(distinct l.id) filter (
    where l.consent_timestamp is not null 
    and l.consent_timestamp < now() - interval '24 months'
  ) as expired_consent_count
from public.workspaces w
left join public.leads l on l.workspace_id = w.id
group by w.id, w.name, w.physical_address, w.auto_footer, w.require_consent, 
         w.data_retention_months, w.compliance_health_score;

grant select on public.v_compliance_summary to authenticated, service_role;

-- ============================================================================
-- Block 453 Complete
-- ============================================================================



