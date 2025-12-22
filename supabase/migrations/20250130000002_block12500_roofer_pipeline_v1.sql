-- Block 12500 — Roofer Project Pipeline v1
-- Lead → Inspection → Estimate → Job Won Tracking
-- Lightweight but powerful roofing-specific sales pipeline

-- ============================================================================
-- 1. ADD PIPELINE COLUMNS TO CONTACTS TABLE
-- ============================================================================

alter table public.contacts
  add column if not exists pipeline_stage text default 'new_lead' check (pipeline_stage in ('new_lead', 'inspection', 'estimate_sent', 'job_won')),
  add column if not exists inspection_at timestamptz,
  add column if not exists inspection_notes text,
  add column if not exists inspection_assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists estimate_amount numeric,
  add column if not exists estimate_sent_at timestamptz,
  add column if not exists estimate_pdf_url text,
  add column if not exists job_value numeric,
  add column if not exists job_won_at timestamptz,
  add column if not exists job_notes text;

-- Create indexes for pipeline queries
create index if not exists idx_contacts_pipeline_stage on public.contacts(pipeline_stage) where pipeline_stage is not null;
create index if not exists idx_contacts_inspection_at on public.contacts(inspection_at) where inspection_at is not null;
create index if not exists idx_contacts_estimate_sent_at on public.contacts(estimate_sent_at) where estimate_sent_at is not null;
create index if not exists idx_contacts_job_won_at on public.contacts(job_won_at) where job_won_at is not null;
create index if not exists idx_contacts_workspace_pipeline on public.contacts(workspace_id, pipeline_stage);

-- ============================================================================
-- 2. AUTO-STAGE MOVEMENT FUNCTION
-- ============================================================================

-- Function to automatically update pipeline stage based on data
create or replace function public.auto_update_pipeline_stage()
returns trigger
language plpgsql
as $$
begin
  -- Auto-move to 'inspection' if inspection_at is set
  if new.inspection_at is not null and (old.inspection_at is null or old.inspection_at is distinct from new.inspection_at) then
    new.pipeline_stage := 'inspection';
  end if;

  -- Auto-move to 'estimate_sent' if estimate_amount is set
  if new.estimate_amount is not null and (old.estimate_amount is null or old.estimate_amount is distinct from new.estimate_amount) then
    new.pipeline_stage := 'estimate_sent';
  end if;

  -- Auto-move to 'job_won' if job_value is set
  if new.job_value is not null and (old.job_value is null or old.job_value is distinct from new.job_value) then
    new.pipeline_stage := 'job_won';
  end if;

  return new;
end;
$$;

-- Create trigger for auto-stage movement
drop trigger if exists trg_auto_update_pipeline_stage on public.contacts;
create trigger trg_auto_update_pipeline_stage
before update on public.contacts
for each row
execute function public.auto_update_pipeline_stage();

-- ============================================================================
-- 3. PIPELINE REVENUE VIEW
-- ============================================================================

-- View for pipeline revenue summary
create or replace view public.pipeline_revenue_summary as
select
  workspace_id,
  count(*) filter (where pipeline_stage = 'new_lead') as leads_count,
  count(*) filter (where pipeline_stage = 'inspection') as inspections_count,
  count(*) filter (where pipeline_stage = 'estimate_sent') as estimates_count,
  coalesce(sum(estimate_amount) filter (where pipeline_stage = 'estimate_sent'), 0) as total_estimate_value,
  count(*) filter (where pipeline_stage = 'job_won') as jobs_won_count,
  coalesce(sum(job_value) filter (where pipeline_stage = 'job_won'), 0) as revenue_won
from public.contacts
where pipeline_stage is not null
group by workspace_id;

-- Grant access to authenticated users
grant select on public.pipeline_revenue_summary to authenticated;

-- ============================================================================
-- 4. ACTIVITY LOG INTEGRATION
-- ============================================================================

-- Ensure activity_events table exists (from Block 11200)
-- If it doesn't exist, we'll log to workspace_activity or create a simple log

-- Function to log pipeline stage changes
create or replace function public.log_pipeline_stage_change()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
begin
  -- Only log if stage actually changed
  if old.pipeline_stage is distinct from new.pipeline_stage then
    -- Try to get org_id from workspace (if workspace has org_id)
    -- Otherwise use workspace_id as org_id
    select coalesce(
      (select org_id from public.workspaces where id = new.workspace_id limit 1),
      new.workspace_id
    ) into v_org_id;

    -- Try to insert into activity_events (from Block 11200)
    begin
      insert into public.activity_events (
        org_id,
        contact_id,
        type,
        title,
        description,
        metadata
      ) values (
        v_org_id,
        new.id,
        'pipeline_stage_changed',
        format('Pipeline stage changed: %s → %s', 
          coalesce(old.pipeline_stage, 'none'), 
          coalesce(new.pipeline_stage, 'none')
        ),
        format('Contact moved from %s to %s stage', 
          coalesce(old.pipeline_stage, 'none'), 
          coalesce(new.pipeline_stage, 'none')
        ),
        jsonb_build_object(
          'from_stage', old.pipeline_stage,
          'to_stage', new.pipeline_stage,
          'inspection_at', new.inspection_at,
          'estimate_amount', new.estimate_amount,
          'job_value', new.job_value
        )
      );
    exception when others then
      -- If activity_events doesn't exist, try workspace_activity
      begin
        insert into public.workspace_activity (
          workspace_id,
          lead_id,
          type,
          subtype,
          metadata
        ) values (
          new.workspace_id,
          new.id,
          'pipeline',
          'stage_changed',
          jsonb_build_object(
            'from_stage', old.pipeline_stage,
            'to_stage', new.pipeline_stage
          )
        );
      exception when others then
        -- Silently fail if neither table exists
        null;
      end;
    end;
  end if;

  return new;
end;
$$;

-- Create trigger for pipeline stage change logging
drop trigger if exists trg_log_pipeline_stage_change on public.contacts;
create trigger trg_log_pipeline_stage_change
after update on public.contacts
for each row
when (old.pipeline_stage is distinct from new.pipeline_stage)
execute function public.log_pipeline_stage_change();

-- ============================================================================
-- 5. HELPER FUNCTION TO UPDATE PIPELINE STAGE
-- ============================================================================

-- RPC function for updating pipeline stage with optional data
create or replace function public.update_pipeline_stage(
  p_contact_id uuid,
  p_stage text,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_contact public.contacts%rowtype;
  v_result jsonb;
begin
  -- Validate stage
  if p_stage not in ('new_lead', 'inspection', 'estimate_sent', 'job_won') then
    raise exception 'Invalid pipeline stage: %', p_stage;
  end if;

  -- Get current contact
  select * into v_contact from public.contacts where id = p_contact_id;
  
  if not found then
    raise exception 'Contact not found: %', p_contact_id;
  end if;

  -- Update contact with stage and optional data
  update public.contacts
  set
    pipeline_stage = p_stage,
    inspection_at = coalesce((p_data->>'inspection_at')::timestamptz, inspection_at),
    inspection_notes = coalesce(p_data->>'inspection_notes', inspection_notes),
    inspection_assigned_to = coalesce((p_data->>'inspection_assigned_to')::uuid, inspection_assigned_to),
    estimate_amount = coalesce((p_data->>'estimate_amount')::numeric, estimate_amount),
    estimate_sent_at = coalesce((p_data->>'estimate_sent_at')::timestamptz, estimate_sent_at),
    estimate_pdf_url = coalesce(p_data->>'estimate_pdf_url', estimate_pdf_url),
    job_value = coalesce((p_data->>'job_value')::numeric, job_value),
    job_won_at = coalesce((p_data->>'job_won_at')::timestamptz, job_won_at),
    job_notes = coalesce(p_data->>'job_notes', job_notes),
    updated_at = now()
  where id = p_contact_id;

  -- Return updated contact
  select row_to_json(t) into v_result
  from (
    select * from public.contacts where id = p_contact_id
  ) t;

  return v_result;
end;
$$;

-- Grant execute to authenticated users
grant execute on function public.update_pipeline_stage(uuid, text, jsonb) to authenticated;

-- ============================================================================
-- 6. RLS POLICIES (if not already set)
-- ============================================================================

-- Ensure RLS is enabled
alter table public.contacts enable row level security;

-- Policy: Users can read contacts in their workspace
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'contacts' 
    and policyname = 'contacts_pipeline_read'
  ) then
    create policy contacts_pipeline_read on public.contacts
      for select
      using (
        workspace_id in (
          select workspace_id from public.workspace_members 
          where user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Policy: Users can update contacts in their workspace
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'contacts' 
    and policyname = 'contacts_pipeline_update'
  ) then
    create policy contacts_pipeline_update on public.contacts
      for update
      using (
        workspace_id in (
          select workspace_id from public.workspace_members 
          where user_id = auth.uid()
        )
      )
      with check (
        workspace_id in (
          select workspace_id from public.workspace_members 
          where user_id = auth.uid()
        )
      );
  end if;
end $$;




























































