-- =========================================================
-- Block 20960 — SmartSend Sequence Builder v1
-- Drag-and-Drop Campaign Steps • Delays • AI Personalization • Branching • Conditions
-- =========================================================

-- ============================================================================
-- PART 1 — Campaign Steps Table
-- ============================================================================
-- Stores individual steps in a campaign sequence (Email, Delay, Condition, Tag)

create table if not exists public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_type text not null check (step_type in ('email', 'delay', 'condition', 'tag')),
  step_order integer not null default 0, -- Order within sequence (0-indexed)
  config jsonb not null default '{}'::jsonb, -- Step-specific configuration
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for efficient querying
create index if not exists idx_campaign_steps_campaign on public.campaign_steps(campaign_id);
create index if not exists idx_campaign_steps_order on public.campaign_steps(campaign_id, step_order);
create index if not exists idx_campaign_steps_type on public.campaign_steps(step_type);

-- RLS
alter table public.campaign_steps enable row level security;

-- Users can access steps for campaigns in their workspace
create policy "campaign_steps_select"
on public.campaign_steps
for select
to authenticated
using (
  campaign_id in (
    select id from public.campaigns
    where workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  )
);

create policy "campaign_steps_insert"
on public.campaign_steps
for insert
to authenticated
with check (
  campaign_id in (
    select id from public.campaigns
    where workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  )
);

create policy "campaign_steps_update"
on public.campaign_steps
for update
to authenticated
using (
  campaign_id in (
    select id from public.campaigns
    where workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  )
)
with check (
  campaign_id in (
    select id from public.campaigns
    where workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  )
);

create policy "campaign_steps_delete"
on public.campaign_steps
for delete
to authenticated
using (
  campaign_id in (
    select id from public.campaigns
    where workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  )
);

-- ============================================================================
-- PART 2 — Campaign Execution Logs Table
-- ============================================================================
-- Tracks execution of steps for individual leads/contacts

create table if not exists public.campaign_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_id uuid references public.campaign_steps(id) on delete set null,
  lead_id uuid, -- References leads/contacts table if exists
  contact_email text not null,
  execution_time timestamptz not null default now(),
  scheduled_time timestamptz, -- When this step was scheduled to run
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed', 'stopped')),
  metadata jsonb default '{}'::jsonb, -- Error messages, personalization data, etc.
  created_at timestamptz not null default now()
);

-- Indexes for execution queries
create index if not exists idx_campaign_logs_campaign on public.campaign_logs(campaign_id);
create index if not exists idx_campaign_logs_step on public.campaign_logs(step_id);
create index if not exists idx_campaign_logs_lead on public.campaign_logs(lead_id) where lead_id is not null;
create index if not exists idx_campaign_logs_email on public.campaign_logs(contact_email);
create index if not exists idx_campaign_logs_status on public.campaign_logs(status);
create index if not exists idx_campaign_logs_scheduled on public.campaign_logs(scheduled_time) where scheduled_time is not null;
create index if not exists idx_campaign_logs_pending on public.campaign_logs(campaign_id, status, scheduled_time) where status = 'pending';

-- RLS
alter table public.campaign_logs enable row level security;

-- Users can access logs for campaigns in their workspace
create policy "campaign_logs_select"
on public.campaign_logs
for select
to authenticated
using (
  campaign_id in (
    select id from public.campaigns
    where workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  )
);

create policy "campaign_logs_insert"
on public.campaign_logs
for insert
to authenticated
with check (
  campaign_id in (
    select id from public.campaigns
    where workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  )
);

create policy "campaign_logs_update"
on public.campaign_logs
for update
to authenticated
using (
  campaign_id in (
    select id from public.campaigns
    where workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  )
)
with check (
  campaign_id in (
    select id from public.campaigns
    where workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  )
);

-- ============================================================================
-- PART 3 — Update Campaigns Table
-- ============================================================================
-- Ensure campaigns table has necessary columns for sequence builder

alter table public.campaigns
  add column if not exists organization_id uuid, -- For backward compatibility, but we use workspace_id
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists published_at timestamptz,
  add column if not exists paused_at timestamptz;

-- Update status constraint to include 'published'
do $$
begin
  -- Drop existing check constraint if it exists
  if exists (
    select 1 from information_schema.table_constraints 
    where constraint_name like '%campaigns_status%' 
    and table_name = 'campaigns'
    and table_schema = 'public'
  ) then
    alter table public.campaigns drop constraint if exists campaigns_status_check;
  end if;
  
  -- Add new check constraint with 'published'
  alter table public.campaigns 
    add constraint campaigns_status_check 
    check (status in ('draft', 'scheduled', 'running', 'paused', 'completed', 'active', 'archived', 'published'));
exception
  when others then null;
end $$;

-- ============================================================================
-- PART 4 — Sequence Templates Table
-- ============================================================================
-- Pre-built sequence templates for roofers

create table if not exists public.sequence_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text, -- 'leak', 'hail', 'storm', 'estimate', 'insurance'
  steps jsonb not null default '[]'::jsonb, -- Array of step configurations
  is_system boolean not null default true, -- System templates vs user-created
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Seed default templates
insert into public.sequence_templates (name, description, category, steps, is_system) values
  (
    'Roof Leak Emergency Flow',
    'Immediate response sequence for urgent leak repairs',
    'leak',
    '[
      {"type": "email", "order": 0, "config": {"subject": "Urgent: {{city}} Roof Leak Repair Available Today", "body": "Hi {{first_name}},\n\nI saw you might have a roof leak. We can be at your {{address}} property today for a free inspection.\n\nAvailable now.\n\n- {{company_name}}"}},
      {"type": "delay", "order": 1, "config": {"duration": 4, "unit": "hours"}},
      {"type": "email", "order": 2, "config": {"subject": "Still need help with that leak?", "body": "{{first_name}},\n\nJust checking in. We have crews in {{city}} today.\n\nReply if you need us.\n\n- {{company_name}}"}},
      {"type": "delay", "order": 3, "config": {"duration": 1, "unit": "days"}},
      {"type": "email", "order": 4, "config": {"subject": "Final check: {{city}} leak repair", "body": "{{first_name}},\n\nLast chance - we can help with your leak today.\n\n- {{company_name}}"}}
    ]'::jsonb,
    true
  ),
  (
    'Hail Damage Inspection Flow',
    'Weather-based personalization for hail damage leads',
    'hail',
    '[
      {"type": "email", "order": 0, "config": {"subject": "Free {{city}} Hail Damage Inspection", "body": "Hi {{first_name}},\n\nWe noticed hail hit {{city}} recently. We do free inspections to check for damage.\n\nAvailable this week.\n\n- {{company_name}}"}},
      {"type": "delay", "order": 1, "config": {"duration": 2, "unit": "days"}},
      {"type": "condition", "order": 2, "config": {"condition": "replied", "action": "stop"}},
      {"type": "email", "order": 3, "config": {"subject": "{{city}} hail inspection - still available", "body": "{{first_name}},\n\nJust following up on the free hail inspection.\n\n- {{company_name}}"}},
      {"type": "delay", "order": 4, "config": {"duration": 3, "unit": "days"}},
      {"type": "email", "order": 5, "config": {"subject": "Last chance: {{city}} hail inspection", "body": "{{first_name}},\n\nFinal follow-up on the free inspection.\n\n- {{company_name}}"}}
    ]'::jsonb,
    true
  ),
  (
    'Storm Damage Lead Nurture Flow',
    'Long-term sequence for storm damage leads',
    'storm',
    '[
      {"type": "email", "order": 0, "config": {"subject": "{{city}} Storm Damage - Free Inspection", "body": "Hi {{first_name}},\n\nWe help homeowners in {{city}} with storm damage. Free inspection available.\n\n- {{company_name}}"}},
      {"type": "delay", "order": 1, "config": {"duration": 3, "unit": "days"}},
      {"type": "email", "order": 2, "config": {"subject": "{{city}} storm damage follow-up", "body": "{{first_name}},\n\nChecking in on your storm damage needs.\n\n- {{company_name}}"}},
      {"type": "delay", "order": 3, "config": {"duration": 1, "unit": "weeks"}},
      {"type": "email", "order": 4, "config": {"subject": "{{city}} storm damage - still here to help", "body": "{{first_name}},\n\nWe are still available for storm damage inspections.\n\n- {{company_name}}"}}
    ]'::jsonb,
    true
  ),
  (
    'Estimate Follow-Up Flow',
    'For retail jobs and estimate requests',
    'estimate',
    '[
      {"type": "email", "order": 0, "config": {"subject": "{{city}} Roof Estimate - Ready When You Are", "body": "Hi {{first_name}},\n\nThanks for your interest. We can provide a free estimate for your {{city}} property.\n\n- {{company_name}}"}},
      {"type": "delay", "order": 1, "config": {"duration": 2, "unit": "days"}},
      {"type": "email", "order": 2, "config": {"subject": "{{city}} estimate - still interested?", "body": "{{first_name}},\n\nJust checking if you still need that estimate.\n\n- {{company_name}}"}},
      {"type": "delay", "order": 3, "config": {"duration": 5, "unit": "days"}},
      {"type": "email", "order": 4, "config": {"subject": "{{city}} estimate - final check", "body": "{{first_name}},\n\nLast follow-up on your estimate request.\n\n- {{company_name}}"}}
    ]'::jsonb,
    true
  ),
  (
    'Insurance Claim Homeowner Education Flow',
    'For homeowners confused about insurance claims',
    "insurance",
    '[
      {"type": "email", "order": 0, "config": {"subject": "{{city}} Insurance Claim Help - Free Consultation", "body": "Hi {{first_name}},\n\nWe help {{city}} homeowners navigate insurance claims. Free consultation.\n\n- {{company_name}}"}},
      {"type": "delay", "order": 1, "config": {"duration": 1, "unit": "days"}},
      {"type": "condition", "order": 2, "config": {"condition": "insurance_email_detected", "action": "switch_sequence", "target": "insurance_flow"}},
      {"type": "email", "order": 3, "config": {"subject": "{{city}} insurance claim guidance", "body": "{{first_name}},\n\nWe can help you understand your insurance claim process.\n\n- {{company_name}}"}},
      {"type": "delay", "order": 4, "config": {"duration": 3, "unit": "days"}},
      {"type": "email", "order": 5, "config": {"subject": "{{city}} insurance claim - still need help?", "body": "{{first_name}},\n\nFinal check on your insurance claim questions.\n\n- {{company_name}}"}}
    ]'::jsonb,
    true
  )
on conflict do nothing;

-- RLS for templates (system templates are public, user templates are private)
alter table public.sequence_templates enable row level security;

create policy "sequence_templates_select"
on public.sequence_templates
for select
to authenticated
using (
  is_system = true
  or created_by = auth.uid()
);

create policy "sequence_templates_insert"
on public.sequence_templates
for insert
to authenticated
with check (created_by = auth.uid());

create policy "sequence_templates_update"
on public.sequence_templates
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "sequence_templates_delete"
on public.sequence_templates
for delete
to authenticated
using (created_by = auth.uid());

-- ============================================================================
-- PART 5 — Helper Functions
-- ============================================================================

-- Function to update updated_at timestamp
create or replace function public.touch_campaign_steps_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_campaign_steps_updated_at
before update on public.campaign_steps
for each row
execute function public.touch_campaign_steps_updated_at();

-- Function to get next step order for a campaign
create or replace function public.get_next_step_order(p_campaign_id uuid)
returns integer
language plpgsql
stable
as $$
declare
  v_max_order integer;
begin
  select coalesce(max(step_order), -1) + 1
  into v_max_order
  from public.campaign_steps
  where campaign_id = p_campaign_id;
  
  return v_max_order;
end;
$$;

-- Function to reorder steps after deletion
create or replace function public.reorder_campaign_steps(p_campaign_id uuid)
returns void
language plpgsql
as $$
begin
  update public.campaign_steps
  set step_order = sub.new_order
  from (
    select id, row_number() over (order by step_order) - 1 as new_order
    from public.campaign_steps
    where campaign_id = p_campaign_id
  ) sub
  where campaign_steps.id = sub.id
  and campaign_steps.step_order != sub.new_order;
end;
$$;

-- ============================================================================
-- PART 6 — Comments
-- ============================================================================

comment on table public.campaign_steps is 'Individual steps in a campaign sequence (email, delay, condition, tag)';
comment on table public.campaign_logs is 'Execution logs for campaign steps per lead/contact';
comment on table public.sequence_templates is 'Pre-built sequence templates for roofers';
comment on column public.campaign_steps.config is 'Step-specific JSON config (email: subject/body, delay: duration/unit, condition: condition/action, tag: label)';
comment on column public.campaign_logs.metadata is 'Execution metadata (error messages, personalization data, etc.)';
















































