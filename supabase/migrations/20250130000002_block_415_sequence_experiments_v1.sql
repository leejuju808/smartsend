-- Block 415: Sequence Experiments v1 (A/B Subject Lines, A/B Steps, Variant Assignment, Per-Variant Analytics)
-- This block upgrades SmartSend from a "send engine" → into a testing machine.

-- 0.1 campaign_step_variants
-- Each step can have unlimited variants (A, B, C…).
create table if not exists public.campaign_step_variants (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.campaign_steps(id) on delete cascade,
  variant_key text not null, -- 'A', 'B', 'C', etc.
  subject text,
  body text,
  delay_hours int,
  created_at timestamptz default now(),
  unique(step_id, variant_key)
);

create index if not exists idx_variants_step_id
on public.campaign_step_variants(step_id);

-- 0.2 lead_step_assignments
-- Each lead gets locked to a specific variant per step.
create table if not exists public.lead_step_assignments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  step_id uuid not null references public.campaign_steps(id) on delete cascade,
  variant_id uuid not null references public.campaign_step_variants(id) on delete cascade,
  assigned_at timestamptz default now(),
  unique(lead_id, step_id)
);

create index if not exists idx_lead_step_assignments_lead_step
on public.lead_step_assignments(lead_id, step_id);

create index if not exists idx_lead_step_assignments_variant
on public.lead_step_assignments(variant_id);

-- 2. Email Events — Add variant_id
-- Track exactly which version causes opens/clicks/replies.
-- Note: This references campaign_step_variants, not template_variants
alter table public.email_events
add column if not exists variant_id uuid references public.campaign_step_variants(id) on delete set null;

create index if not exists idx_email_events_variant_step
on public.email_events(variant_id) where variant_id is not null;

-- Add variant_id to send_queue for tracking
alter table public.send_queue
add column if not exists variant_id uuid references public.campaign_step_variants(id) on delete set null;

create index if not exists idx_send_queue_variant_step
on public.send_queue(variant_id) where variant_id is not null;

-- Add variant_id to send_logs for tracking
alter table public.send_logs
add column if not exists variant_id uuid references public.campaign_step_variants(id) on delete set null;

create index if not exists idx_send_logs_variant_step
on public.send_logs(variant_id) where variant_id is not null;

-- Enable RLS
alter table public.campaign_step_variants enable row level security;
alter table public.lead_step_assignments enable row level security;

-- RLS policies for campaign_step_variants
-- Users can access variants for steps in campaigns they own or have access to
create policy if not exists "campaign_step_variants_select" on public.campaign_step_variants
  for select
  using (
    exists (
      select 1 from public.campaign_steps cs
      join public.campaigns c on c.id = cs.campaign_id
      where cs.id = campaign_step_variants.step_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

create policy if not exists "campaign_step_variants_insert" on public.campaign_step_variants
  for insert
  with check (
    exists (
      select 1 from public.campaign_steps cs
      join public.campaigns c on c.id = cs.campaign_id
      where cs.id = campaign_step_variants.step_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

create policy if not exists "campaign_step_variants_update" on public.campaign_step_variants
  for update
  using (
    exists (
      select 1 from public.campaign_steps cs
      join public.campaigns c on c.id = cs.campaign_id
      where cs.id = campaign_step_variants.step_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

create policy if not exists "campaign_step_variants_delete" on public.campaign_step_variants
  for delete
  using (
    exists (
      select 1 from public.campaign_steps cs
      join public.campaigns c on c.id = cs.campaign_id
      where cs.id = campaign_step_variants.step_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

-- RLS policies for lead_step_assignments
-- Service role can manage assignments (for backend scheduling)
-- Users can read assignments for leads in campaigns they have access to
create policy if not exists "lead_step_assignments_select" on public.lead_step_assignments
  for select
  using (
    exists (
      select 1 from public.campaign_steps cs
      join public.campaigns c on c.id = cs.campaign_id
      where cs.id = lead_step_assignments.step_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

create policy if not exists "lead_step_assignments_insert" on public.lead_step_assignments
  for insert
  with check (true); -- Service role inserts during scheduling

create policy if not exists "lead_step_assignments_update" on public.lead_step_assignments
  for update
  using (
    exists (
      select 1 from public.campaign_steps cs
      join public.campaigns c on c.id = cs.campaign_id
      where cs.id = lead_step_assignments.step_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

-- Function to get variant performance stats per step
create or replace function public.get_step_variant_stats(p_step_id uuid)
returns table (
  variant_id uuid,
  variant_key text,
  sent bigint,
  opened bigint,
  clicked bigint,
  replied bigint,
  open_rate numeric,
  click_rate numeric,
  reply_rate numeric
)
language sql
security definer
as $$
  select 
    csv.id as variant_id,
    csv.variant_key,
    count(distinct sl.id) filter (where sl.status = 'sent') as sent,
    count(distinct ee.id) filter (where ee.event_type = 'open') as opened,
    count(distinct ee.id) filter (where ee.event_type = 'click') as clicked,
    count(distinct ee.id) filter (where ee.event_type = 'reply') as replied,
    case 
      when count(distinct sl.id) filter (where sl.status = 'sent') > 0 
      then round(100.0 * count(distinct ee.id) filter (where ee.event_type = 'open')::numeric / 
                  count(distinct sl.id) filter (where sl.status = 'sent')::numeric, 2)
      else 0
    end as open_rate,
    case 
      when count(distinct sl.id) filter (where sl.status = 'sent') > 0 
      then round(100.0 * count(distinct ee.id) filter (where ee.event_type = 'click')::numeric / 
                  count(distinct sl.id) filter (where sl.status = 'sent')::numeric, 2)
      else 0
    end as click_rate,
    case 
      when count(distinct sl.id) filter (where sl.status = 'sent') > 0 
      then round(100.0 * count(distinct ee.id) filter (where ee.event_type = 'reply')::numeric / 
                  count(distinct sl.id) filter (where sl.status = 'sent')::numeric, 2)
      else 0
    end as reply_rate
  from public.campaign_step_variants csv
  left join public.send_logs sl on sl.variant_id = csv.id and sl.step_no = (
    select step_no from public.campaign_steps where id = csv.step_id
  )
  left join public.email_events ee on ee.variant_id = csv.id
  where csv.step_id = p_step_id
  group by csv.id, csv.variant_key
  order by csv.variant_key;
$$;

comment on table public.campaign_step_variants is 'A/B testing variants for campaign steps';
comment on table public.lead_step_assignments is 'Tracks which variant each lead is assigned to per step';
comment on column public.email_events.variant_id is 'References campaign_step_variants.id for A/B testing attribution';



