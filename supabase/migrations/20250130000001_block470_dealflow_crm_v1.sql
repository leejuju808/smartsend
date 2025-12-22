-- Block 470 — DealFlow CRM v1
-- Pipeline Stages • Drag-and-Drop Boards • Deal Cards • Meeting → Deal Conversion • Tasks • Forecasting
-- This block transforms SmartSend into a true sales operating system with integrated CRM

-- ============================================================================
-- 1️⃣ Add Missing CRM Fields to Deals Table
-- ============================================================================

-- Add CRM-specific fields to deals table
alter table public.deals
  add column if not exists stage text default 'new',
  add column if not exists probability int default 20 check (probability >= 0 and probability <= 100),
  add column if not exists next_action text,
  add column if not exists next_action_due timestamptz,
  add column if not exists lost_reason text,
  add column if not exists pipeline_id uuid;

-- If deal_stage exists, sync it with stage
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'deal_stage') then
    update public.deals
    set stage = deal_stage
    where stage is null or stage = 'new';
  end if;
end $$;

-- Create indexes for new fields
create index if not exists idx_deals_stage on public.deals(stage);
create index if not exists idx_deals_pipeline on public.deals(pipeline_id) where pipeline_id is not null;
create index if not exists idx_deals_next_action_due on public.deals(next_action_due) where next_action_due is not null;
create index if not exists idx_deals_probability on public.deals(probability);

-- ============================================================================
-- 2️⃣ Create Pipelines Table
-- ============================================================================

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  name text not null,
  stages text[] not null default array['New', 'Qualified', 'Meeting Scheduled', 'Proposal Sent', 'Negotiation', 'Won', 'Lost']::text[],
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  unique(workspace_id, name)
);

create index if not exists idx_pipelines_workspace on public.pipelines(workspace_id);
create index if not exists idx_pipelines_brand on public.pipelines(brand_id) where brand_id is not null;
create index if not exists idx_pipelines_default on public.pipelines(workspace_id, is_default) where is_default = true;

-- Add foreign key constraint for pipeline_id in deals
alter table public.deals
  add constraint fk_deals_pipeline foreign key (pipeline_id) references public.pipelines(id) on delete set null;

-- Trigger to update updated_at
create trigger trg_pipelines_updated_at
before update on public.pipelines
for each row
execute function public.set_updated_at();

-- ============================================================================
-- 3️⃣ Create Deal Notes Table
-- ============================================================================

create table if not exists public.deal_notes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  note_text text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_deal_notes_deal on public.deal_notes(deal_id, created_at desc);
create index if not exists idx_deal_notes_workspace on public.deal_notes(workspace_id);
create index if not exists idx_deal_notes_created_by on public.deal_notes(created_by);

-- Trigger to update updated_at
create trigger trg_deal_notes_updated_at
before update on public.deal_notes
for each row
execute function public.set_updated_at();

-- ============================================================================
-- 4️⃣ Link Tasks to Deals
-- ============================================================================

-- Add deal_id to tasks table if it doesn't exist
-- Handle both public.tasks and tasks (they're the same table)
do $$
begin
  -- Check if tasks table exists (with or without schema prefix)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tasks') then
    alter table public.tasks
      add column if not exists deal_id uuid references public.deals(id) on delete set null;
    
    create index if not exists idx_tasks_deal on public.tasks(deal_id) where deal_id is not null;
  end if;
end $$;

-- ============================================================================
-- 5️⃣ Function: Auto-Create Deal from Meeting
-- ============================================================================

create or replace function public.auto_create_deal_from_meeting(
  p_meeting_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal_id uuid;
  v_meeting_record record;
  v_lead_record record;
  v_default_pipeline_id uuid;
  v_brand_id uuid;
begin
  -- Get meeting details
  select * into v_meeting_record
  from public.meetings
  where id = p_meeting_id;
  
  if not found then
    raise exception 'Meeting not found';
  end if;
  
  -- Get lead details
  select * into v_lead_record
  from public.leads
  where id = v_meeting_record.lead_id;
  
  if not found then
    raise exception 'Lead not found';
  end if;
  
  -- Check if deal already exists for this meeting
  select id into v_deal_id
  from public.deals
  where meeting_id = p_meeting_id
  limit 1;
  
  if v_deal_id is not null then
    return v_deal_id;
  end if;
  
  -- Get brand_id from meeting or lead
  v_brand_id := coalesce(
    (select brand_id from public.campaigns where id = v_meeting_record.campaign_id),
    (select brand_id from public.leads where id = v_lead_record.id)
  );
  
  -- Get default pipeline for workspace/brand
  select id into v_default_pipeline_id
  from public.pipelines
  where workspace_id = v_meeting_record.workspace_id
    and (brand_id = v_brand_id or (brand_id is null and v_brand_id is null))
    and is_default = true
  limit 1;
  
  -- If no default pipeline, get any pipeline for workspace
  if v_default_pipeline_id is null then
    select id into v_default_pipeline_id
    from public.pipelines
    where workspace_id = v_meeting_record.workspace_id
    limit 1;
  end if;
  
  -- Create deal
  insert into public.deals (
    lead_id,
    workspace_id,
    deal_name,
    stage,
    probability,
    owner_id,
    meeting_id,
    pipeline_id,
    campaign_id,
    step_id,
    variant_id,
    inbox_id,
    segment_id,
    reply_intent_type,
    value,
    status
  )
  values (
    v_meeting_record.lead_id,
    v_meeting_record.workspace_id,
    coalesce(
      trim(v_lead_record.first_name || ' ' || v_lead_record.last_name),
      v_lead_record.company,
      'Deal'
    ) || ' — Deal',
    'Meeting Scheduled',
    40,
    coalesce(v_meeting_record.owner_id, v_lead_record.owner_id),
    p_meeting_id,
    v_default_pipeline_id,
    v_meeting_record.campaign_id,
    v_meeting_record.step_id,
    v_meeting_record.variant_id,
    v_meeting_record.inbox_id,
    v_meeting_record.segment_id,
    v_meeting_record.reply_intent_type,
    0,
    'open'
  )
  returning id into v_deal_id;
  
  -- Log activity
  insert into public.deal_activity (deal_id, type, body, metadata)
  values (
    v_deal_id,
    'note',
    'Deal created from meeting',
    jsonb_build_object('meeting_id', p_meeting_id, 'auto_created', true)
  );
  
  return v_deal_id;
end;
$$;

-- ============================================================================
-- 6️⃣ Function: Update Deal Stage and Probability
-- ============================================================================

create or replace function public.update_deal_stage(
  p_deal_id uuid,
  p_new_stage text,
  p_probability int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_stage text;
  v_new_probability int;
  v_pipeline_stages text[];
begin
  -- Get current stage
  select stage, probability into v_old_stage, v_new_probability
  from public.deals
  where id = p_deal_id;
  
  if not found then
    raise exception 'Deal not found';
  end if;
  
  -- If stage hasn't changed, return
  if v_old_stage = p_new_stage then
    return;
  end if;
  
  -- Get pipeline stages to validate
  select p.stages into v_pipeline_stages
  from public.deals d
  left join public.pipelines p on p.id = d.pipeline_id
  where d.id = p_deal_id;
  
  -- Determine probability based on stage if not provided
  if p_probability is null then
    case p_new_stage
      when 'New' then v_new_probability := 20;
      when 'Qualified' then v_new_probability := 30;
      when 'Meeting Scheduled' then v_new_probability := 40;
      when 'Proposal Sent' then v_new_probability := 65;
      when 'Negotiation' then v_new_probability := 80;
      when 'Won' then 
        v_new_probability := 100;
        update public.deals set status = 'won', close_date = now() where id = p_deal_id;
      when 'Lost' then 
        v_new_probability := 0;
        update public.deals set status = 'lost', close_date = now() where id = p_deal_id;
      else v_new_probability := coalesce(v_new_probability, 20);
    end case;
  else
    v_new_probability := p_probability;
  end if;
  
  -- Update deal
  update public.deals
  set 
    stage = p_new_stage,
    probability = v_new_probability,
    updated_at = now()
  where id = p_deal_id;
  
  -- Log activity
  insert into public.deal_activity (deal_id, type, body, metadata)
  values (
    p_deal_id,
    'stage_change',
    format('Deal moved: %s → %s', v_old_stage, p_new_stage),
    jsonb_build_object(
      'old_stage', v_old_stage,
      'new_stage', p_new_stage,
      'old_probability', (select probability from public.deals where id = p_deal_id),
      'new_probability', v_new_probability
    )
  );
end;
$$;

-- ============================================================================
-- 7️⃣ Function: Calculate Deal Forecast Contribution
-- ============================================================================

create or replace function public.calculate_deal_forecast(
  p_deal_id uuid
)
returns numeric
language plpgsql
stable
as $$
declare
  v_deal_value numeric;
  v_deal_probability int;
  v_forecast numeric;
begin
  select value, probability into v_deal_value, v_deal_probability
  from public.deals
  where id = p_deal_id;
  
  if not found then
    return 0;
  end if;
  
  -- Forecast = value * (probability / 100)
  v_forecast := coalesce(v_deal_value, 0) * (coalesce(v_deal_probability, 0)::numeric / 100);
  
  return v_forecast;
end;
$$;

-- ============================================================================
-- 8️⃣ Function: Get Next Best Action for Deal
-- ============================================================================

create or replace function public.get_deal_next_action(
  p_deal_id uuid
)
returns text
language plpgsql
stable
as $$
declare
  v_stage text;
  v_last_activity_at timestamptz;
  v_days_since_activity int;
  v_next_action text;
begin
  -- Get deal stage and last activity
  select 
    d.stage,
    max(da.created_at) as last_activity
  into v_stage, v_last_activity_at
  from public.deals d
  left join public.deal_activity da on da.deal_id = d.id
  where d.id = p_deal_id
  group by d.stage;
  
  if not found then
    return null;
  end if;
  
  -- Calculate days since last activity
  v_days_since_activity := coalesce(extract(day from now() - v_last_activity_at)::int, 999);
  
  -- Determine next action based on stage and inactivity
  case v_stage
    when 'New' then
      v_next_action := 'Send qualification email';
    when 'Qualified' then
      v_next_action := 'Schedule discovery call';
    when 'Meeting Scheduled' then
      v_next_action := 'Prepare meeting agenda';
    when 'Proposal Sent' then
      if v_days_since_activity > 3 then
        v_next_action := 'Follow up on proposal';
      else
        v_next_action := 'Wait for response';
      end if;
    when 'Negotiation' then
      if v_days_since_activity > 2 then
        v_next_action := 'Check in on negotiation';
      else
        v_next_action := 'Continue negotiation';
      end if;
    else
      v_next_action := null;
  end case;
  
  return v_next_action;
end;
$$;

-- ============================================================================
-- 9️⃣ Trigger: Auto-Create Deal When Meeting is Logged
-- ============================================================================

create or replace function public.trg_auto_create_deal_from_meeting()
returns trigger
language plpgsql
as $$
begin
  -- Only create deal if status is 'scheduled' or 'completed'
  if new.status in ('scheduled', 'completed') then
    -- Check if deal already exists
    if not exists (
      select 1 from public.deals where meeting_id = new.id
    ) then
      perform public.auto_create_deal_from_meeting(new.id);
    end if;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_meetings_auto_create_deal on public.meetings;
create trigger trg_meetings_auto_create_deal
  after insert on public.meetings
  for each row
  execute function public.trg_auto_create_deal_from_meeting();

-- ============================================================================
-- 🔟 Trigger: Update Next Action When Deal Changes
-- ============================================================================

create or replace function public.trg_update_deal_next_action()
returns trigger
language plpgsql
as $$
declare
  v_next_action text;
begin
  -- Recalculate next action when stage changes
  if old.stage is distinct from new.stage then
    v_next_action := public.get_deal_next_action(new.id);
    
    update public.deals
    set next_action = v_next_action
    where id = new.id;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_deals_update_next_action on public.deals;
create trigger trg_deals_update_next_action
  after update of stage on public.deals
  for each row
  execute function public.trg_update_deal_next_action();

-- ============================================================================
-- 1️⃣1️⃣ Create Default Pipeline for Workspaces
-- ============================================================================

create or replace function public.create_default_pipeline(
  p_workspace_id uuid,
  p_brand_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline_id uuid;
begin
  -- Check if default pipeline already exists
  select id into v_pipeline_id
  from public.pipelines
  where workspace_id = p_workspace_id
    and (brand_id = p_brand_id or (brand_id is null and p_brand_id is null))
    and is_default = true
  limit 1;
  
  if v_pipeline_id is not null then
    return v_pipeline_id;
  end if;
  
  -- Create default pipeline
  insert into public.pipelines (
    workspace_id,
    brand_id,
    name,
    stages,
    is_default
  )
  values (
    p_workspace_id,
    p_brand_id,
    case when p_brand_id is not null then 'Default Pipeline' else 'Default Pipeline' end,
    array['New', 'Qualified', 'Meeting Scheduled', 'Proposal Sent', 'Negotiation', 'Won', 'Lost']::text[],
    true
  )
  returning id into v_pipeline_id;
  
  return v_pipeline_id;
end;
$$;

-- ============================================================================
-- 1️⃣2️⃣ Pipeline Metrics Views
-- ============================================================================

-- Pipeline Overview View
create or replace view public.v_pipeline_overview as
select 
  p.id as pipeline_id,
  p.workspace_id,
  p.brand_id,
  p.name as pipeline_name,
  p.stages,
  count(distinct d.id) as total_deals,
  count(distinct d.id) filter (where d.status = 'open') as open_deals,
  count(distinct d.id) filter (where d.status = 'won') as won_deals,
  count(distinct d.id) filter (where d.status = 'lost') as lost_deals,
  coalesce(sum(d.value) filter (where d.status = 'open'), 0) as pipeline_value,
  coalesce(sum(d.value) filter (where d.status = 'won'), 0) as revenue_closed,
  coalesce(sum(public.calculate_deal_forecast(d.id)) filter (where d.status = 'open'), 0) as forecast_value,
  case 
    when count(distinct d.id) > 0 
    then round((count(distinct d.id) filter (where d.status = 'won')::numeric / count(distinct d.id)::numeric) * 100, 1)
    else 0
  end as win_rate
from public.pipelines p
left join public.deals d on d.pipeline_id = p.id
group by p.id, p.workspace_id, p.brand_id, p.name, p.stages;

-- Deals by Stage View
create or replace view public.v_deals_by_stage as
select 
  d.workspace_id,
  d.pipeline_id,
  d.stage,
  count(*) as deal_count,
  coalesce(sum(d.value), 0) as total_value,
  coalesce(avg(d.probability), 0) as avg_probability,
  coalesce(sum(public.calculate_deal_forecast(d.id)), 0) as forecast_value
from public.deals d
where d.status = 'open'
group by d.workspace_id, d.pipeline_id, d.stage;

-- SDR Performance View
create or replace view public.v_sdr_deal_performance as
select 
  p.id as sdr_id,
  p.full_name as sdr_name,
  p.email as sdr_email,
  d.workspace_id,
  count(distinct d.id) as total_deals,
  count(distinct d.id) filter (where d.status = 'open') as open_deals,
  count(distinct d.id) filter (where d.status = 'won') as won_deals,
  count(distinct d.id) filter (where d.status = 'lost') as lost_deals,
  coalesce(sum(d.value) filter (where d.status = 'won'), 0) as revenue_closed,
  coalesce(sum(d.value) filter (where d.status = 'open'), 0) as pipeline_value,
  coalesce(sum(public.calculate_deal_forecast(d.id)) filter (where d.status = 'open'), 0) as forecast_value,
  case 
    when count(distinct d.id) > 0 
    then round((count(distinct d.id) filter (where d.status = 'won')::numeric / count(distinct d.id)::numeric) * 100, 1)
    else 0
  end as win_rate
from public.profiles p
left join public.deals d on d.owner_id = p.id
group by p.id, p.full_name, p.email, d.workspace_id;

-- Deal Velocity View
create or replace view public.v_deal_velocity as
select 
  d.id as deal_id,
  d.workspace_id,
  d.stage,
  d.created_at,
  d.updated_at,
  extract(day from (d.updated_at - d.created_at)) as days_in_stage,
  extract(day from (now() - d.created_at)) as total_days_open,
  case 
    when d.status = 'won' and d.close_date is not null
    then extract(day from (d.close_date - d.created_at))
    else null
  end as days_to_close
from public.deals d;

-- Pipeline Forecast View (30/60 days)
create or replace view public.v_pipeline_forecast_detailed as
select 
  w.id as workspace_id,
  p.id as pipeline_id,
  p.name as pipeline_name,
  coalesce(sum(public.calculate_deal_forecast(d.id)) filter (
    where d.status = 'open' 
    and d.expected_close_date >= now() 
    and d.expected_close_date <= now() + interval '30 days'
  ), 0) as forecast_30d,
  coalesce(sum(public.calculate_deal_forecast(d.id)) filter (
    where d.status = 'open' 
    and d.expected_close_date >= now() 
    and d.expected_close_date <= now() + interval '60 days'
  ), 0) as forecast_60d,
  coalesce(sum(public.calculate_deal_forecast(d.id)) filter (
    where d.status = 'open' 
    and d.forecast_category = 'commit'
  ), 0) as committed_pipeline,
  coalesce(sum(public.calculate_deal_forecast(d.id)) filter (
    where d.status = 'open' 
    and d.forecast_category = 'best_case'
  ), 0) as best_case_pipeline
from public.workspaces w
left join public.pipelines p on p.workspace_id = w.id
left join public.deals d on d.pipeline_id = p.id
group by w.id, p.id, p.name;

-- ============================================================================
-- 1️⃣3️⃣ RLS Policies
-- ============================================================================

-- Enable RLS
alter table public.pipelines enable row level security;
alter table public.deal_notes enable row level security;

-- Pipelines RLS: Workspace members can read/write pipelines
create policy "pipelines_select_workspace_member" on public.pipelines
  for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pipelines.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "pipelines_insert_workspace_member" on public.pipelines
  for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pipelines.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "pipelines_update_workspace_member" on public.pipelines
  for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pipelines.workspace_id
      and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pipelines.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "pipelines_delete_workspace_member" on public.pipelines
  for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pipelines.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
    )
  );

-- Deal Notes RLS: Workspace members can read/write notes
create policy "deal_notes_select_workspace_member" on public.deal_notes
  for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = deal_notes.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "deal_notes_insert_workspace_member" on public.deal_notes
  for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = deal_notes.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "deal_notes_update_workspace_member" on public.deal_notes
  for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = deal_notes.workspace_id
      and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = deal_notes.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "deal_notes_delete_workspace_member" on public.deal_notes
  for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = deal_notes.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Service role can do everything
create policy "pipelines_service_role" on public.pipelines
  for all
  to service_role
  using (true)
  with check (true);

create policy "deal_notes_service_role" on public.deal_notes
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 1️⃣4️⃣ Grant Permissions
-- ============================================================================

grant execute on function public.auto_create_deal_from_meeting(uuid) to service_role, authenticated;
grant execute on function public.update_deal_stage(uuid, text, int) to service_role, authenticated;
grant execute on function public.calculate_deal_forecast(uuid) to service_role, authenticated;
grant execute on function public.get_deal_next_action(uuid) to service_role, authenticated;
grant execute on function public.create_default_pipeline(uuid, uuid) to service_role, authenticated;

grant select on public.v_pipeline_overview to authenticated;
grant select on public.v_deals_by_stage to authenticated;
grant select on public.v_sdr_deal_performance to authenticated;
grant select on public.v_deal_velocity to authenticated;
grant select on public.v_pipeline_forecast_detailed to authenticated;

-- ============================================================================
-- 1️⃣5️⃣ Comments
-- ============================================================================

comment on table public.pipelines is 'CRM pipelines with customizable stages. Each workspace/brand can have multiple pipelines.';
comment on column public.pipelines.stages is 'Array of stage names (e.g., ["New", "Qualified", "Meeting Scheduled", "Proposal Sent", "Negotiation", "Won", "Lost"])';
comment on column public.pipelines.is_default is 'Whether this is the default pipeline for the workspace/brand';

comment on table public.deal_notes is 'Notes and activity log entries for deals. Used for CRM activity tracking.';
comment on column public.deal_notes.note_text is 'The note content. Can include timestamps, user mentions, etc.';

comment on function public.auto_create_deal_from_meeting(uuid) is 'Automatically creates a deal when a meeting is logged. Sets stage to "Meeting Scheduled" and probability to 40%.';
comment on function public.update_deal_stage(uuid, text, int) is 'Updates deal stage and automatically adjusts probability. Logs activity.';
comment on function public.calculate_deal_forecast(uuid) is 'Calculates forecast contribution: value * (probability / 100)';
comment on function public.get_deal_next_action(uuid) is 'AI-suggested next action based on deal stage and last activity date';

-- ============================================================================
-- Block 470 Complete ✅
-- ============================================================================

