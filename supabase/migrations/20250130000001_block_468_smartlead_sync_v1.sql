-- Block 468 — SmartLead Sync v1
-- Lead Enrichment Auto-Refresh • Multi-Source Hydration • Field Confidence Scoring • Always-Fresh Lead Data
-- This block transforms SmartSend from a static CRM into a dynamic, self-updating lead intelligence system.

-- ============================================================================
-- 1️⃣ Schema — Lead Enrichment History Table
-- ============================================================================

create table if not exists public.lead_enrichment_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  workspace_id uuid not null,
  field text not null,
  old_value text,
  new_value text,
  confidence numeric check (confidence >= 0 and confidence <= 1),
  source text,
  created_at timestamptz default now()
);

create index if not exists idx_lead_enrichment_history_lead on public.lead_enrichment_history(lead_id);
create index if not exists idx_lead_enrichment_history_workspace on public.lead_enrichment_history(workspace_id);
create index if not exists idx_lead_enrichment_history_field on public.lead_enrichment_history(field);
create index if not exists idx_lead_enrichment_history_created on public.lead_enrichment_history(created_at desc);

comment on table public.lead_enrichment_history is 'Tracks all enrichment changes to leads with confidence scores and sources';
comment on column public.lead_enrichment_history.confidence is 'Confidence score 0.0-1.0 for the enrichment';
comment on column public.lead_enrichment_history.source is 'Source of enrichment: website, email, linkedin, domain, heuristics, etc.';

-- RLS for enrichment history
alter table public.lead_enrichment_history enable row level security;

create policy "lead_enrichment_history_select_workspace_member" on public.lead_enrichment_history
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = lead_enrichment_history.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 2️⃣ Schema — Enrichment Confidence Column
-- ============================================================================

alter table public.leads
  add column if not exists enrichment_confidence jsonb default '{}'::jsonb;

comment on column public.leads.enrichment_confidence is 'Field-level confidence scores: {"industry": 0.88, "role": 0.72, "company_size": 0.64}';

create index if not exists idx_leads_enrichment_confidence_gin on public.leads using gin(enrichment_confidence);

-- ============================================================================
-- 3️⃣ Schema — Additional Lead Columns for Enrichment
-- ============================================================================

-- Ensure all enrichment columns exist
alter table public.leads
  add column if not exists industry text,
  add column if not exists role text,
  add column if not exists seniority text,
  add column if not exists company_size text,
  add column if not exists website text,
  add column if not exists linkedin_url text,
  add column if not exists phone_valid boolean,
  add column if not exists country text,
  add column if not exists timezone text,
  add column if not exists technology_stack text[],
  add column if not exists last_enriched_at timestamptz,
  add column if not exists enrichment_status text default 'pending' check (enrichment_status in ('pending', 'enriched', 'stale', 'error'));

create index if not exists idx_leads_industry on public.leads(workspace_id, industry) where industry is not null;
create index if not exists idx_leads_role on public.leads(workspace_id, role) where role is not null;
create index if not exists idx_leads_company_size on public.leads(workspace_id, company_size) where company_size is not null;
create index if not exists idx_leads_last_enriched on public.leads(workspace_id, last_enriched_at desc nulls last);
create index if not exists idx_leads_enrichment_status on public.leads(workspace_id, enrichment_status);

-- ============================================================================
-- 4️⃣ Helper Function — Log Enrichment Change
-- ============================================================================

create or replace function public.log_enrichment_change(
  p_lead_id uuid,
  p_workspace_id uuid,
  p_field text,
  p_old_value text,
  p_new_value text,
  p_confidence numeric,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only log if value actually changed
  if p_old_value is distinct from p_new_value then
    insert into public.lead_enrichment_history (
      lead_id,
      workspace_id,
      field,
      old_value,
      new_value,
      confidence,
      source
    ) values (
      p_lead_id,
      p_workspace_id,
      p_field,
      p_old_value,
      p_new_value,
      p_confidence,
      p_source
    );
  end if;
end;
$$;

-- ============================================================================
-- 5️⃣ Helper Function — Update Enrichment Confidence
-- ============================================================================

create or replace function public.update_enrichment_confidence(
  p_lead_id uuid,
  p_field text,
  p_confidence numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.leads
  set enrichment_confidence = jsonb_set(
    coalesce(enrichment_confidence, '{}'::jsonb),
    array[p_field],
    to_jsonb(p_confidence)
  )
  where id = p_lead_id;
end;
$$;

-- ============================================================================
-- 6️⃣ Helper Function — Get Enrichment Candidates
-- ============================================================================

create or replace function public.get_enrichment_candidates(
  p_workspace_id uuid,
  p_limit int default 100,
  p_priority text default 'normal' -- 'normal', 'high', 'new', 'stale'
)
returns table(
  lead_id uuid,
  workspace_id uuid,
  email text,
  first_name text,
  last_name text,
  company text,
  title text,
  website text,
  linkedin_url text,
  phone text,
  industry text,
  last_enriched_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    l.id as lead_id,
    l.workspace_id,
    l.email,
    l.first_name,
    l.last_name,
    l.company,
    l.title,
    l.website,
    l.linkedin_url,
    l.phone,
    l.industry,
    l.last_enriched_at
  from public.leads l
  where l.workspace_id = p_workspace_id
    and (
      case p_priority
        when 'new' then
          l.last_enriched_at is null
          and l.created_at >= now() - interval '7 days'
        when 'stale' then
          l.last_enriched_at is not null
          and l.last_enriched_at < now() - interval '30 days'
        when 'high' then
          l.priority = 'A'
          or l.icp_score >= 80
          or exists (
            select 1 from public.send_queue sq
            where sq.lead_id = l.id
              and sq.status = 'pending'
          )
        else
          l.last_enriched_at is null
          or l.last_enriched_at < now() - interval '7 days'
      end
    )
  order by
    case p_priority
      when 'high' then 1
      when 'new' then 2
      when 'stale' then 3
      else 4
    end,
    coalesce(l.last_enriched_at, to_timestamp(0)) asc
  limit p_limit;
end;
$$;

-- ============================================================================
-- 7️⃣ Trigger — Auto-Trigger Router v2 After Enrichment
-- ============================================================================

create or replace function public.trigger_router_after_enrichment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_should_reroute boolean := false;
begin
  -- Check if enrichment fields changed
  if (
    (old.industry is distinct from new.industry) or
    (old.role is distinct from new.role) or
    (old.company_size is distinct from new.company_size) or
    (old.title is distinct from new.title) or
    (old.company is distinct from new.company)
  ) then
    v_should_reroute := true;
  end if;

  -- Trigger router recalculation if needed (but avoid infinite loops)
  if v_should_reroute and new.workspace_id is not null then
    -- Use a flag to prevent recursive triggers
    -- Recalculate ICP score (which will trigger router)
    begin
      perform public.calculate_icp_score(new.id, new.workspace_id);
      
      -- Re-run routing (this may update the lead again, but won't trigger this trigger recursively
      -- because route_lead updates owner_id/inbox_id, not the enrichment fields)
      perform public.route_lead(new.id, new.workspace_id, true);
    exception
      when others then
        -- Log error but don't fail the update
        raise warning 'Error in router trigger after enrichment: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_leads_enrichment_router on public.leads;
create trigger trg_leads_enrichment_router
after update of industry, role, company_size, title, company, icp_score on public.leads
for each row
when (
  (old.industry is distinct from new.industry) or
  (old.role is distinct from new.role) or
  (old.company_size is distinct from new.company_size) or
  (old.title is distinct from new.title) or
  (old.company is distinct from new.company) or
  (old.icp_score is distinct from new.icp_score)
)
execute function public.trigger_router_after_enrichment();

-- ============================================================================
-- 8️⃣ Function — Apply Enrichment Updates
-- ============================================================================

create or replace function public.apply_enrichment_updates(
  p_lead_id uuid,
  p_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_workspace_id uuid;
  v_field text;
  v_old_value text;
  v_new_value text;
  v_confidence numeric;
  v_source text;
  v_result jsonb := '{}'::jsonb;
begin
  -- Get lead and workspace
  select id, workspace_id into v_lead
  from public.leads
  where id = p_lead_id;

  if not found then
    return jsonb_build_object('error', 'Lead not found');
  end if;

  v_workspace_id := v_lead.workspace_id;

  -- Process each field update
  for v_field, v_new_value in select * from jsonb_each_text(p_updates->'fields')
  loop
    -- Skip if field doesn't exist in leads table (safety check)
    if v_field not in ('industry', 'role', 'seniority', 'company_size', 'website', 'linkedin_url', 'phone', 'phone_valid', 'country', 'timezone', 'technology_stack', 'email', 'title', 'company') then
      continue;
    end if;
    
    -- Get old value
    execute format('select %I::text from public.leads where id = $1', v_field)
    into v_old_value
    using p_lead_id;

    -- Get confidence and source from updates
    v_confidence := (p_updates->'confidences'->>v_field)::numeric;
    v_source := p_updates->>'source';

    -- Handle array fields specially
    if v_field = 'technology_stack' then
      execute format('update public.leads set %I = $1 where id = $2', v_field)
      using (p_updates->'fields'->v_field)::text[], p_lead_id;
    else
      -- Update the field
      execute format('update public.leads set %I = $1 where id = $2', v_field)
      using v_new_value, p_lead_id;
    end if;

    -- Log the change
    perform public.log_enrichment_change(
      p_lead_id,
      v_workspace_id,
      v_field,
      v_old_value,
      v_new_value,
      coalesce(v_confidence, 0.5),
      coalesce(v_source, 'unknown')
    );

    -- Update confidence score
    if v_confidence is not null then
      perform public.update_enrichment_confidence(p_lead_id, v_field, v_confidence);
    end if;

    -- Track in result
    v_result := jsonb_set(
      v_result,
      array['updated_fields', v_field],
      jsonb_build_object(
        'old_value', v_old_value,
        'new_value', v_new_value,
        'confidence', v_confidence,
        'source', v_source
      )
    );
  end loop;

  -- Update last_enriched_at
  update public.leads
  set last_enriched_at = now(),
      enrichment_status = 'enriched'
  where id = p_lead_id;

  v_result := jsonb_set(v_result, '{lead_id}', to_jsonb(p_lead_id));
  v_result := jsonb_set(v_result, '{workspace_id}', to_jsonb(v_workspace_id));
  v_result := jsonb_set(v_result, '{enriched_at}', to_jsonb(now()::text));

  return v_result;
end;
$$;

-- ============================================================================
-- 9️⃣ Grant Permissions
-- ============================================================================

grant execute on function public.log_enrichment_change(uuid, uuid, text, text, text, numeric, text) to authenticated, service_role;
grant execute on function public.update_enrichment_confidence(uuid, text, numeric) to authenticated, service_role;
grant execute on function public.get_enrichment_candidates(uuid, int, text) to authenticated, service_role;
grant execute on function public.apply_enrichment_updates(uuid, jsonb) to authenticated, service_role;

