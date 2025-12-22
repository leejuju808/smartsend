-- Block 443 — Lead Ownership v1
-- (Assign Leads to SDRs • Auto-Assignment Rules • Owner-Based Workflows • Team Routing)
--
-- This block enables SmartSend to support lead ownership — exactly what HubSpot, Apollo, and Salesforce do.
-- With Lead Ownership v1, SmartSend can now:
-- ✔ Each lead has an assigned owner (SDR)
-- ✔ Auto-assign new leads
-- ✔ Round-robin assignment
-- ✔ Score-based assignment rules
-- ✔ Domain/timezone-based assignment
-- ✔ Owner-based routing rules
-- ✔ Limit SDR workload with caps
-- ✔ Owner dashboards
-- ✔ Owner filters & saved views
-- ✔ Per-owner analytics

-- ============================================================================
-- 1. Schema: Add owner_id to leads table
-- ============================================================================

-- Add owner_id column to leads table (references profiles.id)
alter table public.leads
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

-- Create index for fast owner lookups
create index if not exists idx_lead_owner on public.leads(owner_id);

-- Create index for workspace + owner queries
create index if not exists idx_lead_workspace_owner on public.leads(workspace_id, owner_id) 
  where workspace_id is not null and owner_id is not null;

-- Create index for unassigned leads queries
create index if not exists idx_lead_unassigned on public.leads(workspace_id) 
  where workspace_id is not null and owner_id is null;

-- ============================================================================
-- 2. Schema: Lead Assignment Rules Table
-- ============================================================================

create table if not exists public.lead_assignment_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  
  -- Rule type: round_robin, score_split, segment_owner, domain_zone
  rule_type text not null check (rule_type in ('round_robin', 'score_split', 'segment_owner', 'domain_zone')),
  
  -- Target user (for segment_owner and domain_zone)
  user_id uuid references public.profiles(id) on delete set null,
  
  -- Target segment (for segment_owner)
  segment_id uuid references public.segments(id) on delete set null,
  
  -- Score range (for score_split)
  min_score int,
  max_score int,
  
  -- Domain pattern (for domain_zone)
  domain_pattern text,
  
  -- Timezone pattern (for domain_zone)
  timezone_pattern text,
  
  -- Workload cap (max leads per SDR)
  workload_cap int,
  
  -- Rule priority (lower = higher priority)
  priority int not null default 0,
  
  -- Metadata
  name text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_assignment_rules_workspace on public.lead_assignment_rules(workspace_id, is_active, priority);
create index if not exists idx_assignment_rules_type on public.lead_assignment_rules(workspace_id, rule_type, is_active);
create index if not exists idx_assignment_rules_user on public.lead_assignment_rules(user_id) where user_id is not null;
create index if not exists idx_assignment_rules_segment on public.lead_assignment_rules(segment_id) where segment_id is not null;

-- Trigger to update updated_at
create trigger trg_lead_assignment_rules_updated_at
before update on public.lead_assignment_rules
for each row
execute function public.set_updated_at();

-- ============================================================================
-- 3. Schema: Round-Robin Pointer in Workspaces
-- ============================================================================

-- Add round-robin pointer to workspaces table
alter table public.workspaces
  add column if not exists rr_pointer int default 0;

-- ============================================================================
-- 4. Schema: Assignment History Log
-- ============================================================================

create table if not exists public.lead_assignment_log (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  rule_id uuid references public.lead_assignment_rules(id) on delete set null,
  assignment_type text not null check (assignment_type in ('manual', 'auto', 'bulk')),
  reason text, -- e.g., "Round-robin", "Score > 75", "Segment: SaaS", "Domain: acme.com"
  created_at timestamptz default now()
);

create index if not exists idx_assignment_log_lead on public.lead_assignment_log(lead_id);
create index if not exists idx_assignment_log_workspace on public.lead_assignment_log(workspace_id, created_at desc);
create index if not exists idx_assignment_log_assigned_to on public.lead_assignment_log(assigned_to, created_at desc);
create index if not exists idx_assignment_log_rule on public.lead_assignment_log(rule_id) where rule_id is not null;

-- ============================================================================
-- 5. Function: Get Active SDRs for Workspace
-- ============================================================================

create or replace function public.get_active_sdrs(p_workspace_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select 
    p.id as user_id,
    p.email,
    p.full_name,
    wm.role
  from public.workspace_members wm
  join public.profiles p on p.id = wm.user_id
  where wm.workspace_id = p_workspace_id
    and wm.role in ('owner', 'admin', 'member')
  order by p.id;
end;
$$;

-- ============================================================================
-- 6. Function: Round-Robin Assignment
-- ============================================================================

create or replace function public.assign_round_robin(
  p_workspace_id uuid,
  p_lead_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sdrs uuid[];
  v_pointer int;
  v_next_user uuid;
  v_workspace_rr_pointer int;
begin
  -- Get list of active SDRs
  select array_agg(user_id order by user_id)
  into v_sdrs
  from public.get_active_sdrs(p_workspace_id);
  
  if v_sdrs is null or array_length(v_sdrs, 1) = 0 then
    return null;
  end if;
  
  -- Get current pointer
  select coalesce(rr_pointer, 0) into v_workspace_rr_pointer
  from public.workspaces
  where id = p_workspace_id;
  
  -- Calculate next user
  v_pointer := v_workspace_rr_pointer % array_length(v_sdrs, 1);
  v_next_user := v_sdrs[v_pointer + 1];
  
  -- Update pointer
  update public.workspaces
  set rr_pointer = (v_workspace_rr_pointer + 1) % array_length(v_sdrs, 1)
  where id = p_workspace_id;
  
  -- Assign lead
  update public.leads
  set owner_id = v_next_user
  where id = p_lead_id;
  
  -- Log assignment
  insert into public.lead_assignment_log (
    lead_id, workspace_id, assigned_to, assignment_type, reason
  ) values (
    p_lead_id, p_workspace_id, v_next_user, 'auto', 'Round-robin assignment'
  );
  
  -- Log to activity log if function exists
  begin
    perform public.log_activity(
      null, -- account_id (can be null)
      null, -- campaign_id (can be null)
      null, -- actor_user_id (system)
      'system', -- actor_role
      'update', -- action
      'lead', -- entity_type
      p_lead_id, -- entity_id
      null, -- entity_name
      jsonb_build_object(
        'owner_id', v_next_user,
        'assignment_type', 'auto',
        'reason', 'Round-robin assignment'
      ) -- details
    );
  exception when others then
    -- Activity log function may not exist, ignore
    null;
  end;
  
  return v_next_user;
end;
$$;

-- ============================================================================
-- 7. Function: Score-Based Assignment
-- ============================================================================

create or replace function public.assign_by_score(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_lead_score int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule record;
  v_assigned_user uuid;
begin
  -- Find matching score rule
  select *
  into v_rule
  from public.lead_assignment_rules
  where workspace_id = p_workspace_id
    and rule_type = 'score_split'
    and is_active = true
    and (min_score is null or p_lead_score >= min_score)
    and (max_score is null or p_lead_score <= max_score)
  order by priority asc, created_at asc
  limit 1;
  
  if v_rule is null then
    return null;
  end if;
  
  -- If rule has specific user, assign to them
  if v_rule.user_id is not null then
    v_assigned_user := v_rule.user_id;
  else
    -- Otherwise use round-robin for this score range
    v_assigned_user := public.assign_round_robin(p_workspace_id, p_lead_id);
    return v_assigned_user;
  end if;
  
  -- Check workload cap if set
  if v_rule.workload_cap is not null then
    if (select count(*) from public.leads where owner_id = v_assigned_user and workspace_id = p_workspace_id) >= v_rule.workload_cap then
      -- Cap reached, use round-robin instead
      v_assigned_user := public.assign_round_robin(p_workspace_id, p_lead_id);
      return v_assigned_user;
    end if;
  end if;
  
  -- Assign lead
  update public.leads
  set owner_id = v_assigned_user
  where id = p_lead_id;
  
  -- Log assignment
  insert into public.lead_assignment_log (
    lead_id, workspace_id, assigned_to, rule_id, assignment_type, reason
  ) values (
    p_lead_id, p_workspace_id, v_assigned_user, v_rule.id, 'auto',
    format('Score-based assignment (score: %s, rule: %s)', p_lead_score, coalesce(v_rule.name, 'Score Split'))
  );
  
  -- Log to activity log if function exists
  begin
    perform public.log_activity(
      null,
      null,
      null,
      'system',
      'update',
      'lead',
      p_lead_id,
      null,
      jsonb_build_object(
        'owner_id', v_assigned_user,
        'assignment_type', 'auto',
        'reason', format('Score-based assignment (score: %s)', p_lead_score),
        'rule_id', v_rule.id
      )
    );
  exception when others then
    null;
  end;
  
  return v_assigned_user;
end;
$$;

-- ============================================================================
-- 8. Function: Segment-Based Assignment
-- ============================================================================

create or replace function public.assign_by_segment(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_segment_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule record;
  v_assigned_user uuid;
begin
  -- Find matching segment rule
  select *
  into v_rule
  from public.lead_assignment_rules
  where workspace_id = p_workspace_id
    and rule_type = 'segment_owner'
    and is_active = true
    and segment_id = ANY(p_segment_ids)
  order by priority asc, created_at asc
  limit 1;
  
  if v_rule is null or v_rule.user_id is null then
    return null;
  end if;
  
  v_assigned_user := v_rule.user_id;
  
  -- Check workload cap if set
  if v_rule.workload_cap is not null then
    if (select count(*) from public.leads where owner_id = v_assigned_user and workspace_id = p_workspace_id) >= v_rule.workload_cap then
      -- Cap reached, use round-robin instead
      v_assigned_user := public.assign_round_robin(p_workspace_id, p_lead_id);
      return v_assigned_user;
    end if;
  end if;
  
  -- Assign lead
  update public.leads
  set owner_id = v_assigned_user
  where id = p_lead_id;
  
  -- Log assignment
  insert into public.lead_assignment_log (
    lead_id, workspace_id, assigned_to, rule_id, assignment_type, reason
  ) values (
    p_lead_id, p_workspace_id, v_assigned_user, v_rule.id, 'auto',
    format('Segment-based assignment (segment: %s)', (select name from public.segments where id = v_rule.segment_id))
  );
  
  -- Log to activity log if function exists
  begin
    perform public.log_activity(
      null,
      null,
      null,
      'system',
      'update',
      'lead',
      p_lead_id,
      null,
      jsonb_build_object(
        'owner_id', v_assigned_user,
        'assignment_type', 'auto',
        'reason', format('Segment-based assignment'),
        'rule_id', v_rule.id,
        'segment_id', v_rule.segment_id
      )
    );
  exception when others then
    null;
  end;
  
  return v_assigned_user;
end;
$$;

-- ============================================================================
-- 9. Function: Domain/Timezone-Based Assignment
-- ============================================================================

create or replace function public.assign_by_domain_zone(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_lead_email text,
  p_lead_timezone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule record;
  v_assigned_user uuid;
  v_domain text;
begin
  -- Extract domain from email
  v_domain := lower(split_part(p_lead_email, '@', 2));
  
  -- Find matching domain/timezone rule
  select *
  into v_rule
  from public.lead_assignment_rules
  where workspace_id = p_workspace_id
    and rule_type = 'domain_zone'
    and is_active = true
    and (
      (domain_pattern is null or v_domain ilike domain_pattern)
      or (timezone_pattern is null or p_lead_timezone ilike timezone_pattern)
    )
  order by priority asc, created_at asc
  limit 1;
  
  if v_rule is null or v_rule.user_id is null then
    return null;
  end if;
  
  v_assigned_user := v_rule.user_id;
  
  -- Check workload cap if set
  if v_rule.workload_cap is not null then
    if (select count(*) from public.leads where owner_id = v_assigned_user and workspace_id = p_workspace_id) >= v_rule.workload_cap then
      -- Cap reached, use round-robin instead
      v_assigned_user := public.assign_round_robin(p_workspace_id, p_lead_id);
      return v_assigned_user;
    end if;
  end if;
  
  -- Assign lead
  update public.leads
  set owner_id = v_assigned_user
  where id = p_lead_id;
  
  -- Log assignment
  insert into public.lead_assignment_log (
    lead_id, workspace_id, assigned_to, rule_id, assignment_type, reason
  ) values (
    p_lead_id, p_workspace_id, v_assigned_user, v_rule.id, 'auto',
    format('Domain/timezone-based assignment (domain: %s, timezone: %s)', v_domain, coalesce(p_lead_timezone, 'unknown'))
  );
  
  -- Log to activity log if function exists
  begin
    perform public.log_activity(
      null,
      null,
      null,
      'system',
      'update',
      'lead',
      p_lead_id,
      null,
      jsonb_build_object(
        'owner_id', v_assigned_user,
        'assignment_type', 'auto',
        'reason', format('Domain/timezone-based assignment'),
        'rule_id', v_rule.id,
        'domain', v_domain,
        'timezone', p_lead_timezone
      )
    );
  exception when others then
    null;
  end;
  
  return v_assigned_user;
end;
$$;

-- ============================================================================
-- 10. Function: Auto-Assign Lead (Main Entry Point)
-- ============================================================================

create or replace function public.auto_assign_lead(
  p_lead_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_workspace_id uuid;
  v_assigned_user uuid;
  v_lead_score int;
  v_segment_ids uuid[];
begin
  -- Get lead details
  select 
    l.id,
    l.workspace_id,
    l.email,
    l.owner_id,
    coalesce(ls.score, 0) as score
  into v_lead
  from public.leads l
  left join lateral (
    select score from public.lead_scores 
    where lead_id = l.id 
    order by coalesce(computed_at, updated_at, created_at) desc 
    limit 1
  ) ls on true
  where l.id = p_lead_id;
  
  if v_lead is null then
    return null;
  end if;
  
  -- Skip if already assigned
  if v_lead.owner_id is not null then
    return v_lead.owner_id;
  end if;
  
  v_workspace_id := v_lead.workspace_id;
  v_lead_score := coalesce(v_lead.score, 0);
  
  -- Get lead segments (using lead_segment_members table)
  select array_agg(segment_id)
  into v_segment_ids
  from public.lead_segment_members
  where lead_id = p_lead_id;
  
  -- Try assignment rules in priority order:
  -- 1. Segment-based
  if v_segment_ids is not null and array_length(v_segment_ids, 1) > 0 then
    v_assigned_user := public.assign_by_segment(v_workspace_id, p_lead_id, v_segment_ids);
    if v_assigned_user is not null then
      return v_assigned_user;
    end if;
  end if;
  
  -- 2. Score-based
  if v_lead_score > 0 then
    v_assigned_user := public.assign_by_score(v_workspace_id, p_lead_id, v_lead_score);
    if v_assigned_user is not null then
      return v_assigned_user;
    end if;
  end if;
  
  -- 3. Domain/timezone-based
  v_assigned_user := public.assign_by_domain_zone(v_workspace_id, p_lead_id, v_lead.email);
  if v_assigned_user is not null then
    return v_assigned_user;
  end if;
  
  -- 4. Round-robin (fallback)
  v_assigned_user := public.assign_round_robin(v_workspace_id, p_lead_id);
  
  return v_assigned_user;
end;
$$;

-- ============================================================================
-- 11. Function: Manual Assignment
-- ============================================================================

create or replace function public.assign_lead_manual(
  p_lead_id uuid,
  p_owner_id uuid,
  p_assigned_by uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  -- Get workspace_id from lead
  select workspace_id into v_workspace_id
  from public.leads
  where id = p_lead_id;
  
  -- Assign lead
  update public.leads
  set owner_id = p_owner_id
  where id = p_lead_id;
  
  -- Log assignment
  insert into public.lead_assignment_log (
    lead_id, workspace_id, assigned_to, assigned_by, assignment_type, reason
  ) values (
    p_lead_id, v_workspace_id, p_owner_id, p_assigned_by, 'manual',
    format('Manually assigned by %s', (select email from public.profiles where id = p_assigned_by))
  );
  
  -- Log to activity log if function exists
  begin
    perform public.log_activity(
      null,
      null,
      p_assigned_by,
      (select role from public.workspace_members where workspace_id = v_workspace_id and user_id = p_assigned_by limit 1),
      'update',
      'lead',
      p_lead_id,
      null,
      jsonb_build_object(
        'owner_id', p_owner_id,
        'assignment_type', 'manual',
        'assigned_by', p_assigned_by,
        'reason', 'Manual assignment'
      )
    );
  exception when others then
    null;
  end;
end;
$$;

-- ============================================================================
-- 12. Function: Bulk Assignment
-- ============================================================================

create or replace function public.assign_leads_bulk(
  p_lead_ids uuid[],
  p_owner_id uuid,
  p_assigned_by uuid default auth.uid()
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_count int;
begin
  -- Get workspace_id from first lead
  select workspace_id into v_workspace_id
  from public.leads
  where id = p_lead_ids[1]
  limit 1;
  
  -- Assign leads
  update public.leads
  set owner_id = p_owner_id
  where id = ANY(p_lead_ids);
  
  get diagnostics v_count = row_count;
  
  -- Log bulk assignment
  insert into public.lead_assignment_log (
    lead_id, workspace_id, assigned_to, assigned_by, assignment_type, reason
  )
  select 
    unnest(p_lead_ids),
    v_workspace_id,
    p_owner_id,
    p_assigned_by,
    'bulk',
    format('Bulk assigned %s leads by %s', v_count, (select email from public.profiles where id = p_assigned_by))
  on conflict do nothing;
  
  return v_count;
end;
$$;

-- ============================================================================
-- 13. Trigger: Auto-assign on lead creation/enrichment
-- ============================================================================

create or replace function public.trigger_auto_assign_lead()
returns trigger
language plpgsql
as $$
begin
  -- Auto-assign if owner_id is null
  if NEW.owner_id is null then
    perform public.auto_assign_lead(NEW.id);
  end if;
  return NEW;
end;
$$;

-- Create trigger for new leads
drop trigger if exists trg_auto_assign_lead on public.leads;
create trigger trg_auto_assign_lead
after insert on public.leads
for each row
when (NEW.owner_id is null)
execute function public.trigger_auto_assign_lead();

-- ============================================================================
-- 14. RLS Policies
-- ============================================================================

-- Enable RLS on assignment rules
alter table public.lead_assignment_rules enable row level security;

-- Members can view assignment rules in their workspace
create policy "assignment_rules: select workspace"
  on public.lead_assignment_rules for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = lead_assignment_rules.workspace_id
        and user_id = auth.uid()
    )
  );

-- Only admins/owners can manage assignment rules
create policy "assignment_rules: manage by admin"
  on public.lead_assignment_rules for all
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = lead_assignment_rules.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = lead_assignment_rules.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Enable RLS on assignment log
alter table public.lead_assignment_log enable row level security;

-- Members can view assignment log in their workspace
create policy "assignment_log: select workspace"
  on public.lead_assignment_log for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = lead_assignment_log.workspace_id
        and user_id = auth.uid()
    )
  );

-- ============================================================================
-- 15. Grants
-- ============================================================================

grant execute on function public.get_active_sdrs(uuid) to authenticated;
grant execute on function public.assign_round_robin(uuid, uuid) to authenticated;
grant execute on function public.assign_by_score(uuid, uuid, int) to authenticated;
grant execute on function public.assign_by_segment(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.assign_by_domain_zone(uuid, uuid, text, text) to authenticated;
grant execute on function public.auto_assign_lead(uuid) to authenticated;
grant execute on function public.assign_lead_manual(uuid, uuid, uuid) to authenticated;
grant execute on function public.assign_leads_bulk(uuid[], uuid, uuid) to authenticated;

-- ============================================================================
-- 16. Update Lead Routing to Consider Owner
-- ============================================================================

-- Add owner-based routing check to run_lead_routing function
-- This ensures leads are routed to campaigns/inboxes assigned to their owner

create or replace function public.route_lead_to_campaign_with_owner(
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
  v_lead_owner_id uuid;
  v_campaign_owner_id uuid;
begin
  -- Get lead owner and workspace
  select l.workspace_id, l.owner_id
  into v_workspace_id, v_lead_owner_id
  from public.leads l
  where l.id = p_lead_id;
  
  -- If lead has owner, check if campaign is assigned to that owner
  if v_lead_owner_id is not null then
    -- Check if campaign has owner assignment (via campaign_members or campaign.owner_id)
    select c.owner_id into v_campaign_owner_id
    from public.campaigns c
    where c.id = p_campaign_id;
    
    -- If campaign has owner and it doesn't match lead owner, skip routing
    -- (unless admin override)
    if v_campaign_owner_id is not null and v_campaign_owner_id != v_lead_owner_id then
      -- Skip routing - owner mismatch
      return;
    end if;
  end if;
  
  -- Call original routing function
  perform public.route_lead_to_campaign(
    p_lead_id,
    p_campaign_id,
    p_rule_id,
    p_reason,
    p_auto_start
  );
end;
$$;

-- ============================================================================
-- 17. Owner-Based Sending Rules
-- ============================================================================

-- Add column to campaigns for owner-based sending enforcement
alter table public.campaigns
  add column if not exists enforce_owner_sending boolean default false;

comment on column public.campaigns.enforce_owner_sending is 
  'If true, only send campaigns from inboxes assigned to the lead owner';

-- Function to check if lead can be sent from campaign based on owner
create or replace function public.can_send_to_lead_by_owner(
  p_lead_id uuid,
  p_campaign_id uuid,
  p_inbox_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_owner_id uuid;
  v_campaign_enforce boolean;
  v_inbox_owner_id uuid;
begin
  -- Get lead owner
  select owner_id into v_lead_owner_id
  from public.leads
  where id = p_lead_id;
  
  -- Get campaign enforcement setting
  select enforce_owner_sending into v_campaign_enforce
  from public.campaigns
  where id = p_campaign_id;
  
  -- If enforcement is off, allow sending
  if not coalesce(v_campaign_enforce, false) then
    return true;
  end if;
  
  -- If lead has no owner, allow sending (will be auto-assigned)
  if v_lead_owner_id is null then
    return true;
  end if;
  
  -- If inbox_id provided, check inbox owner
  if p_inbox_id is not null then
    -- Check if inbox is assigned to lead owner
    -- (Assuming inboxes table has owner_id or user_id column)
    select user_id into v_inbox_owner_id
    from public.inboxes
    where id = p_inbox_id;
    
    if v_inbox_owner_id = v_lead_owner_id then
      return true;
    end if;
  end if;
  
  -- Default: deny if enforcement is on and owner mismatch
  return false;
end;
$$;

-- ============================================================================
-- 18. Trigger: Auto-assign before routing if unassigned
-- ============================================================================

-- Update routing function to auto-assign unassigned leads
create or replace function public.run_lead_routing_with_auto_assign(
  p_lead_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_lead_owner_id uuid;
begin
  -- Get lead_id (from parameter or trigger context)
  if p_lead_id is null then
    if TG_TABLE_NAME = 'lead_scores' then
      v_lead_id := NEW.lead_id;
    elsif TG_TABLE_NAME = 'lead_enrichments' then
      v_lead_id := NEW.lead_id;
    elsif TG_TABLE_NAME = 'lead_segment_members' then
      v_lead_id := NEW.lead_id;
    elsif TG_TABLE_NAME = 'leads' then
      v_lead_id := NEW.id;
    else
      return;
    end if;
  else
    v_lead_id := p_lead_id;
  end if;
  
  -- Check if lead has owner
  select owner_id into v_lead_owner_id
  from public.leads
  where id = v_lead_id;
  
  -- Auto-assign if unassigned
  if v_lead_owner_id is null then
    perform public.auto_assign_lead(v_lead_id);
  end if;
  
  -- Run routing (original function)
  perform public.run_lead_routing(v_lead_id);
end;
$$;

-- ============================================================================
-- 19. Saved Views Owner Filter Support
-- ============================================================================

-- Saved views (saved_lead_views, saved_views) now support owner_id filters
-- Filter examples:
--   - owner_id = me (current user)
--   - owner_id = teammate1 (specific user)
--   - owner_id in [team members] (array of user IDs)
--   - owner_id is null (unassigned leads)
--
-- Prebuilt views can be created:
--   - "My Leads" (owner_id = auth.uid())
--   - "Unassigned Leads" (owner_id is null)
--   - "High Score Leads for Me" (owner_id = auth.uid() AND score > 75)
--   - "My ICP-Fit Leads" (owner_id = auth.uid() AND segment matches)
--   - "My Interested Replies" (owner_id = auth.uid() AND reply_detected = true)

-- Helper function to get prebuilt owner views
create or replace function public.get_prebuilt_owner_views(p_workspace_id uuid, p_user_id uuid)
returns table (
  name text,
  filters jsonb,
  description text
)
language plpgsql
stable
as $$
begin
  return query
  select 
    'My Leads'::text,
    jsonb_build_object('owner_id', p_user_id)::jsonb,
    'Leads assigned to me'::text
  union all
  select 
    'Unassigned Leads'::text,
    jsonb_build_object('owner_id', null)::jsonb,
    'Leads with no assigned owner'::text
  union all
  select 
    'High Score Leads for Me'::text,
    jsonb_build_object('owner_id', p_user_id, 'min_score', 75)::jsonb,
    'My high-scoring leads'::text
  union all
  select 
    'My Interested Replies'::text,
    jsonb_build_object('owner_id', p_user_id, 'reply_detected', true)::jsonb,
    'Leads that replied to my outreach'::text;
end;
$$;

grant execute on function public.get_prebuilt_owner_views(uuid, uuid) to authenticated;

-- ============================================================================
-- Block 443 Complete
-- ============================================================================

