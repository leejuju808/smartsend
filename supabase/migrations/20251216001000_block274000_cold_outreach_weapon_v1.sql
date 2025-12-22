-- =========================================================
-- Block 274000 — SmartSend Cold Outreach Weapon v1
-- “Fill the Top While Closing the Bottom”
--
-- Additive schema for Roofing Homeowner Outreach v1.
-- IMPORTANT: This repo already has existing campaigns/leads/email tracking tables.
-- We only add columns + a lightweight outreach_events table for v1 counters.
-- =========================================================

-- ============================================================================
-- 1) campaigns: add template_type for locked v1 templates
-- ============================================================================

alter table public.campaigns
  add column if not exists template_type text;

comment on column public.campaigns.template_type is
  'Block 274000: Locked v1 template type for roofing homeowner outreach (storm_damage_check | roof_age_replacement | missed_insurance_followup)';

-- Optional: constrain values when set (keep it permissive to avoid breaking older rows)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_template_type_check'
  ) then
    alter table public.campaigns
      add constraint campaigns_template_type_check
      check (
        template_type is null
        or template_type in (
          'storm_damage_check',
          'roof_age_replacement',
          'missed_insurance_followup'
        )
      );
  end if;
exception when others then
  -- If constraint creation fails due to drift, keep schema permissive.
  null;
end $$;

create index if not exists idx_campaigns_template_type
  on public.campaigns(template_type)
  where template_type is not null;

-- ============================================================================
-- 2) leads: add outreach_status (v1 only, does NOT replace pipeline status)
-- ============================================================================

alter table public.leads
  add column if not exists outreach_status text not null default 'uncontacted';

comment on column public.leads.outreach_status is
  'Block 274000: Cold outreach status (uncontacted/contacted/replied/hot/closed). Separate from pipeline status.';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'outreach_status'
  ) then
    -- Drop existing constraint if present (name can drift)
    if exists (
      select 1 from pg_constraint
      where conname = 'leads_outreach_status_check'
    ) then
      alter table public.leads drop constraint leads_outreach_status_check;
    end if;

    alter table public.leads
      add constraint leads_outreach_status_check
      check (outreach_status in ('uncontacted','contacted','replied','hot','closed'));
  end if;
exception when others then null;
end $$;

create index if not exists idx_leads_outreach_status
  on public.leads(outreach_status);

-- Ensure homeowner address fields exist (many blocks already add these; keep idempotent)
alter table public.leads
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text;

-- ============================================================================
-- 3) outreach_events: lightweight event stream for v1 counters
-- ============================================================================

create table if not exists public.outreach_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_type text not null check (event_type in ('sent','opened','replied')),
  created_at timestamptz not null default now()
);

comment on table public.outreach_events is
  'Block 274000: Lightweight outreach event stream (sent/opened/replied) for v1 counters.';

create index if not exists idx_outreach_events_lead_type_time
  on public.outreach_events(lead_id, event_type, created_at desc);

create index if not exists idx_outreach_events_type_time
  on public.outreach_events(event_type, created_at desc);

-- RLS: scope outreach_events to campaigns/leads visible in workspace (best-effort).
alter table public.outreach_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'outreach_events'
      and policyname = 'outreach_events_select_scoped'
  ) then
    create policy "outreach_events_select_scoped"
      on public.outreach_events
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.leads l
          where l.id = outreach_events.lead_id
            and (
              -- Workspace scoping
              l.workspace_id in (
                select workspace_id from public.workspace_members where user_id = auth.uid()
              )
              -- Owner scoping fallback (older schemas)
              or l.owner_id = auth.uid()
              or l.user_id = auth.uid()
              -- Team scoping fallback (older schemas)
              or l.team_id in (
                select team_id from public.team_members where user_id = auth.uid()
              )
            )
        )
      );
  end if;
exception when others then null;
end $$;

-- Service role can insert for counters (edge/webhook / cron / worker)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'outreach_events'
      and policyname = 'outreach_events_insert_service'
  ) then
    create policy "outreach_events_insert_service"
      on public.outreach_events
      for insert
      to service_role
      with check (true);
  end if;
exception when others then null;
end $$;

grant select on public.outreach_events to authenticated;
grant insert on public.outreach_events to service_role;










