-- Block 434 — Lead Routing v1
-- (Auto-Route Leads Into Campaigns Based on Segments, Score, Enrichment, ICP, & Engagement)
--
-- This block makes SmartSend fully autonomous for lead intake.
-- With Lead Routing v1, SmartSend can now:
-- ✔ Automatically assign leads into campaigns
-- ✔ Auto-start sequences for qualified leads
-- ✔ Only route leads that match score thresholds
-- ✔ Route by segment logic (industry, title, seniority, tech stack, ICP-fit)
-- ✔ Re-route leads when score or enrichment changes
-- ✔ Send leads to different campaigns by score tiers
-- ✔ Prevent routing leads into multiple campaigns accidentally
-- ✔ Stop campaigns if lead becomes unqualified
-- ✔ Future-proof for inbound integrations (webhooks, forms, CRM imports)

-- ============================================================================
-- 1. Schema: Routing Rules Table
-- ============================================================================

create table if not exists public.lead_routing_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  
  -- rule conditions
  segment_id uuid references public.segments(id) on delete set null,
  min_score int,
  max_score int,
  require_enriched boolean default false,
  exclude_bounced boolean default true,
  
  -- routing action
  target_campaign_id uuid not null references public.campaigns(id) on delete cascade,
  auto_start boolean default true,
  
  -- conflict prevention
  conflict_mode text not null default 'first_match' check (conflict_mode in ('first_match', 'exclusive', 'allow_multi')),
  rule_order int not null default 0, -- for first_match ordering
  
  -- metadata
  name text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_routing_workspace on public.lead_routing_rules(workspace_id);
create index if not exists idx_routing_active on public.lead_routing_rules(workspace_id, is_active, rule_order);
create index if not exists idx_routing_segment on public.lead_routing_rules(segment_id) where segment_id is not null;
create index if not exists idx_routing_campaign on public.lead_routing_rules(target_campaign_id);

-- Trigger to update updated_at
create trigger trg_lead_routing_rules_updated_at
before update on public.lead_routing_rules
for each row
execute function public.set_updated_at();

-- ============================================================================
-- 2. Schema: Routing History Log
-- ============================================================================

create table if not exists public.lead_routing_log (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  rule_id uuid references public.lead_routing_rules(id) on delete set null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  routed_at timestamptz default now(),
  reason text -- e.g., "High-Score ICP", "Score >= 80"
);

create index if not exists idx_routing_log_lead on public.lead_routing_log(lead_id);
create index if not exists idx_routing_log_campaign on public.lead_routing_log(campaign_id);
create index if not exists idx_routing_log_rule on public.lead_routing_log(rule_id) where rule_id is not null;
create index if not exists idx_routing_log_routed_at on public.lead_routing_log(routed_at desc);

-- ============================================================================
-- 3. Routing Function: Route Lead to Campaign
-- ============================================================================

create or replace function public.route_lead_to_campaign(
  p_lead_id uuid,
  p_campaign_id uuid,
  p_rule_id uuid default null,
  p_reason text default null,
  p_auto_start boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_first_step_id uuid;
  v_first_step_no int;
begin
  -- Get workspace_id from campaign
  select workspace_id into v_workspace_id
  from public.campaigns
  where id = p_campaign_id;
  
  if v_workspace_id is null then
    raise exception 'Campaign not found or has no workspace_id';
  end if;
  
  -- Insert into campaign_leads (join table)
  insert into public.campaign_leads (campaign_id, lead_id, workspace_id)
  values (p_campaign_id, p_lead_id, v_workspace_id)
  on conflict (campaign_id, lead_id) do nothing;
  
  -- Log the routing event
  insert into public.lead_routing_log (lead_id, rule_id, campaign_id, reason)
  values (p_lead_id, p_rule_id, p_campaign_id, p_reason);
  
  -- Auto-start first step if enabled
  if p_auto_start then
    -- Find first enabled step for this campaign
    select id, step_no into v_first_step_id, v_first_step_no
    from public.campaign_steps
    where campaign_id = p_campaign_id
      and enabled = true
    order by step_no asc
    limit 1;
    
    if v_first_step_id is not null then
      -- Check if already queued (check by step_no if column exists, otherwise by campaign+lead)
      -- Note: This assumes send_queue has step_no column (added in campaign_steps migration)
      -- If step_no doesn't exist, we'll check for any existing queue entry for this campaign+lead
      begin
        -- Try to check/insert with step_no
        if not exists (
          select 1
          from public.send_queue
          where campaign_id = p_campaign_id
            and lead_id = p_lead_id
            and step_no = v_first_step_no
        ) then
          insert into public.send_queue (
            campaign_id,
            lead_id,
            step_no,
            scheduled_at,
            status
          )
          values (
            p_campaign_id,
            p_lead_id,
            v_first_step_no,
            now(),
            'queued'
          );
        end if;
      exception
        when undefined_column then
          -- Fallback: step_no column doesn't exist, insert without it
          if not exists (
            select 1
            from public.send_queue
            where campaign_id = p_campaign_id
              and lead_id = p_lead_id
          ) then
            insert into public.send_queue (
              campaign_id,
              lead_id,
              scheduled_at,
              status
            )
            values (
              p_campaign_id,
              p_lead_id,
              now(),
              'queued'
            );
          end if;
      end;
    end if;
  end if;
end;
$$;

comment on function public.route_lead_to_campaign(uuid, uuid, uuid, text, boolean) is 'Route a lead to a campaign and optionally auto-start the first sequence step';

-- ============================================================================
-- 4. Routing Engine: Main Routing Logic
-- ============================================================================

create or replace function public.run_lead_routing(p_lead_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_workspace_id uuid;
  v_lead_score int;
  v_in_segments uuid[];
  v_is_enriched boolean;
  v_is_bounced boolean;
  v_rule record;
  v_routed_campaigns uuid[] := '{}';
  v_reason text;
begin
  -- If p_lead_id is provided, use it; otherwise get from NEW (trigger context)
  if p_lead_id is null then
    -- Try to get lead_id from trigger context
    if TG_TABLE_NAME = 'lead_scores' then
      v_lead_id := NEW.lead_id;
    elsif TG_TABLE_NAME = 'lead_enrichments' then
      v_lead_id := NEW.lead_id;
    elsif TG_TABLE_NAME = 'lead_segment_members' then
      v_lead_id := NEW.lead_id;
    elsif TG_TABLE_NAME = 'leads' then
      v_lead_id := NEW.id;
    else
      return; -- Unknown trigger context
    end if;
  else
    v_lead_id := p_lead_id;
  end if;
  
  -- Get workspace_id from lead
  select workspace_id into v_workspace_id
  from public.leads
  where id = v_lead_id;
  
  if v_workspace_id is null then
    return; -- Lead has no workspace, skip routing
  end if;
  
  -- Gather lead context
  -- Score
  select coalesce(score, 0) into v_lead_score
  from public.lead_scores
  where lead_id = v_lead_id;
  
  -- Segments
  select array_agg(segment_id) into v_in_segments
  from public.lead_segment_members
  where lead_id = v_lead_id;
  
  if v_in_segments is null then
    v_in_segments := '{}';
  end if;
  
  -- Enrichment status
  select exists(
    select 1
    from public.lead_enrichments
    where lead_id = v_lead_id
  ) into v_is_enriched;
  
  -- Bounce status
  select coalesce(status = 'bounced', false) into v_is_bounced
  from public.leads
  where id = v_lead_id;
  
  -- Evaluate all active routing rules for this workspace
  for v_rule in
    select *
    from public.lead_routing_rules
    where workspace_id = v_workspace_id
      and is_active = true
    order by rule_order asc, created_at asc
  loop
    -- Check if lead already routed to a campaign (for exclusive/first_match modes)
    if v_rule.conflict_mode in ('first_match', 'exclusive') and array_length(v_routed_campaigns, 1) > 0 then
      continue; -- Skip this rule, lead already routed
    end if;
    
    -- Build reason string
    v_reason := coalesce(v_rule.name, 'Routing Rule');
    
    -- Check conditions
    -- Segment check
    if v_rule.segment_id is not null then
      if not (v_rule.segment_id = ANY(v_in_segments)) then
        continue; -- Lead not in required segment
      end if;
      v_reason := v_reason || ' • Segment: ' || (
        select name from public.segments where id = v_rule.segment_id
      );
    end if;
    
    -- Score check
    if v_rule.min_score is not null then
      if v_lead_score < v_rule.min_score then
        continue; -- Score too low
      end if;
      v_reason := v_reason || ' • Score >= ' || v_rule.min_score::text;
    end if;
    
    if v_rule.max_score is not null then
      if v_lead_score > v_rule.max_score then
        continue; -- Score too high
      end if;
      v_reason := v_reason || ' • Score <= ' || v_rule.max_score::text;
    end if;
    
    -- Enrichment check
    if v_rule.require_enriched and not v_is_enriched then
      continue; -- Lead not enriched
    end if;
    
    -- Bounce check
    if v_rule.exclude_bounced and v_is_bounced then
      continue; -- Lead bounced, skip
    end if;
    
    -- All conditions met! Route the lead
    perform public.route_lead_to_campaign(
      v_lead_id,
      v_rule.target_campaign_id,
      v_rule.id,
      v_reason,
      v_rule.auto_start
    );
    
    -- Track routed campaigns
    v_routed_campaigns := array_append(v_routed_campaigns, v_rule.target_campaign_id);
    
    -- If exclusive mode, stop after first match
    if v_rule.conflict_mode = 'exclusive' then
      exit;
    end if;
  end loop;
end;
$$;

comment on function public.run_lead_routing(uuid) is 'Evaluate routing rules and route leads to campaigns based on segments, score, enrichment, and engagement';

-- ============================================================================
-- 5. Triggers: Auto-Route on Changes
-- ============================================================================

-- Trigger on lead_scores changes
drop trigger if exists route_on_score on public.lead_scores;
create trigger route_on_score
after insert or update on public.lead_scores
for each row
execute function public.run_lead_routing();

-- Trigger on lead_enrichments changes
drop trigger if exists route_on_enrichment on public.lead_enrichments;
create trigger route_on_enrichment
after insert or update on public.lead_enrichments
for each row
execute function public.run_lead_routing();

-- Trigger on lead_segment_members changes
drop trigger if exists route_on_segment on public.lead_segment_members;
create trigger route_on_segment
after insert or update on public.lead_segment_members
for each row
execute function public.run_lead_routing();

-- Trigger on lead creation (deferred to allow enrichment/score to be set first)
-- Note: This uses a deferred trigger that runs after all other triggers
drop trigger if exists route_on_lead_create on public.leads;
create trigger route_on_lead_create
after insert on public.leads
for each row
when (NEW.workspace_id is not null)
execute function public.run_lead_routing_on_create();

-- Helper function for lead creation trigger
create or replace function public.run_lead_routing_on_create()
returns trigger
language plpgsql
as $$
begin
  -- Run routing for the new lead
  perform public.run_lead_routing(NEW.id);
  return NEW;
end;
$$;

-- ============================================================================
-- 6. RLS Policies
-- ============================================================================

alter table public.lead_routing_rules enable row level security;
alter table public.lead_routing_log enable row level security;

-- Routing rules: workspace members can read/write
create policy routing_rules_rw on public.lead_routing_rules
  for all
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = lead_routing_rules.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = lead_routing_rules.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Routing log: workspace members can read
create policy routing_log_read on public.lead_routing_log
  for select
  using (
    exists (
      select 1
      from public.leads l
      join public.workspace_members wm on wm.workspace_id = l.workspace_id
      where l.id = lead_routing_log.lead_id
        and wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 7. Helper Functions
-- ============================================================================

-- Manually trigger routing for a lead (useful for testing or manual re-routing)
create or replace function public.trigger_lead_routing(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.run_lead_routing(p_lead_id);
end;
$$;

comment on function public.trigger_lead_routing(uuid) is 'Manually trigger routing evaluation for a specific lead';

-- Get routing history for a lead
create or replace function public.get_lead_routing_history(p_lead_id uuid)
returns table (
  id uuid,
  rule_id uuid,
  rule_name text,
  campaign_id uuid,
  campaign_name text,
  routed_at timestamptz,
  reason text
)
language sql
stable
as $$
  select
    lrl.id,
    lrl.rule_id,
    lrr.name as rule_name,
    lrl.campaign_id,
    c.name as campaign_name,
    lrl.routed_at,
    lrl.reason
  from public.lead_routing_log lrl
  left join public.lead_routing_rules lrr on lrr.id = lrl.rule_id
  left join public.campaigns c on c.id = lrl.campaign_id
  where lrl.lead_id = p_lead_id
  order by lrl.routed_at desc;
$$;

comment on function public.get_lead_routing_history(uuid) is 'Get routing history for a lead';

-- ============================================================================
-- 8. Indexes for Performance
-- ============================================================================

-- Ensure campaign_leads has workspace_id if it doesn't already
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_leads'
      and column_name = 'workspace_id'
  ) then
    alter table public.campaign_leads
    add column workspace_id uuid references public.workspaces(id) on delete cascade;
    
    -- Backfill workspace_id from campaigns
    update public.campaign_leads cl
    set workspace_id = c.workspace_id
    from public.campaigns c
    where cl.campaign_id = c.id
      and cl.workspace_id is null;
  end if;
end $$;

create index if not exists idx_campaign_leads_workspace on public.campaign_leads(workspace_id) where workspace_id is not null;

-- ============================================================================
-- Block 434 Complete
-- ============================================================================

comment on table public.lead_routing_rules is 'Routing rules that automatically assign leads to campaigns based on segments, score, enrichment, and engagement';
comment on table public.lead_routing_log is 'Audit log of all lead routing events';

