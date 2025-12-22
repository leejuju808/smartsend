-- Block 458 — Intent Router v2
-- AI Lead Assignment • ICP Matching • Priority Scoring • Routing Rules 2.0 • Inbox/SDR Auto-Match
-- This block upgrades SmartSend's routing system from a simple "assign leads to SDRs/inboxes" 
-- into a true AI Lead Router that understands ICP fit, buyer intent, industry, company signals,
-- reply sentiment, lead value, SDR specialization, inbox/domain health, sending capacity, revenue history,
-- and predicted conversion probability.

-- ============================================================================
-- 1️⃣ Schema Additions — ICP Scoring & Priority
-- ============================================================================

-- Add ICP score column to leads table
alter table public.leads
  add column if not exists icp_score int check (icp_score >= 0 and icp_score <= 100);

-- Add priority tier column to leads table
alter table public.leads
  add column if not exists priority text check (priority in ('A', 'B', 'C'));

-- Create indexes for fast priority and ICP queries
create index if not exists idx_leads_icp_score on public.leads(workspace_id, icp_score desc nulls last);
create index if not exists idx_leads_priority on public.leads(workspace_id, priority nulls last);
create index if not exists idx_leads_priority_icp on public.leads(workspace_id, priority, icp_score desc nulls last);

-- ============================================================================
-- 2️⃣ Schema Additions — SDR Specialization
-- ============================================================================

-- Add specialization column to profiles table
alter table public.profiles
  add column if not exists specialization text; -- e.g., 'construction', 'cleaning', 'hvac', 'smb', 'saas'

-- Create index for specialization lookups
create index if not exists idx_profiles_specialization on public.profiles(specialization) where specialization is not null;

-- ============================================================================
-- 3️⃣ Schema — Routing Rules v2 Table
-- ============================================================================

create table if not exists public.routing_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  
  -- Rule field and operator
  field text not null,          -- e.g., 'industry', 'job_title', 'country', 'icp_score', 'priority', 'predicted_interest'
  operator text not null,       -- 'equals', 'contains', '>', '<', '>=', '<=', 'in', 'not_in'
  value text,                   -- The value to match against (JSON for 'in' operator)
  
  -- Assignment target
  assign_to_type text not null check (assign_to_type in ('inbox', 'sdr', 'both')),
  inbox_id uuid references public.sender_inboxes(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  
  -- Rule priority (lower = higher priority, evaluated first)
  priority int not null default 100,
  
  -- Metadata
  name text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_routing_rules_workspace on public.routing_rules(workspace_id, is_active, priority);
create index if not exists idx_routing_rules_field on public.routing_rules(workspace_id, field, is_active);
create index if not exists idx_routing_rules_inbox on public.routing_rules(inbox_id) where inbox_id is not null;
create index if not exists idx_routing_rules_owner on public.routing_rules(owner_id) where owner_id is not null;

-- Trigger to update updated_at
create trigger trg_routing_rules_updated_at
before update on public.routing_rules
for each row
execute function public.set_updated_at();

-- Enable RLS
alter table public.routing_rules enable row level security;

-- RLS Policies
create policy "routing_rules_select_workspace_member" on public.routing_rules
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = routing_rules.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "routing_rules_insert_workspace_admin" on public.routing_rules
  for insert with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = routing_rules.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "routing_rules_update_workspace_admin" on public.routing_rules
  for update using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = routing_rules.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "routing_rules_delete_workspace_admin" on public.routing_rules
  for delete using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = routing_rules.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- ============================================================================
-- 4️⃣ Function — Calculate ICP Score
-- ============================================================================

create or replace function public.calculate_icp_score(
  p_lead_id uuid,
  p_workspace_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score int := 0;
  v_lead record;
  v_industry_match int := 0;
  v_company_size_match int := 0;
  v_title_match int := 0;
  v_segment_performance float := 0;
  v_reply_intent_score int := 0;
  v_predicted_interest float := 0;
  v_revenue_history_score int := 0;
begin
  -- Get lead data
  select 
    l.*,
    le.reply_intent,
    le.reply_confidence
  into v_lead
  from public.leads l
  left join public.lead_engagement le on le.lead_id = l.id
  where l.id = p_lead_id
    and l.workspace_id = p_workspace_id;
  
  if v_lead is null then
    return 0;
  end if;
  
  -- Industry matching (0-25 points)
  -- Check if lead industry matches workspace's top-performing industries
  select coalesce(avg(case when industry = v_lead.company then 25 else 0 end), 0)
  into v_industry_match
  from (
    select distinct industry
    from public.leads
    where workspace_id = p_workspace_id
      and id in (
        select lead_id from public.meetings where workspace_id = p_workspace_id
        union
        select lead_id from public.deals where workspace_id = p_workspace_id and status = 'won'
      )
    limit 5
  ) top_industries;
  
  -- Company size matching (0-20 points)
  -- Simplified: assume SMB (10-50) is ideal, adjust based on your ICP
  v_company_size_match := 20; -- Default, can be enhanced with actual company size data
  
  -- Title matching (0-20 points)
  -- Check if title contains keywords that correlate with conversions
  if v_lead.title is not null then
    select case 
      when lower(v_lead.title) ~ 'owner|founder|ceo|president|director|manager' then 20
      when lower(v_lead.title) ~ 'vp|vice president|head of' then 15
      else 10
    end into v_title_match;
  end if;
  
  -- Segment performance (0-15 points)
  -- Check conversion rate of segments this lead belongs to
  select coalesce(
    avg(case 
      when exists (select 1 from public.meetings m where m.lead_id = l.id) then 15
      when exists (select 1 from public.deals d where d.lead_id = l.id and d.status = 'won') then 20
      else 0
    end),
    0
  )
  into v_segment_performance
  from public.leads l
  where l.workspace_id = p_workspace_id
    and exists (
      select 1 from public.lead_segment_members lsm1
      where lsm1.lead_id = l.id
        and exists (
          select 1 from public.lead_segment_members lsm2
          where lsm2.lead_id = p_lead_id
            and lsm2.segment_id = lsm1.segment_id
        )
    )
  limit 100;
  
  -- Reply intent scoring (0-10 points)
  if v_lead.reply_intent = 'interested' then
    v_reply_intent_score := 10;
  elsif v_lead.reply_intent = 'maybe' then
    v_reply_intent_score := 5;
  elsif v_lead.reply_intent = 'not_now' then
    v_reply_intent_score := 2;
  end if;
  
  -- Predicted interest (0-10 points)
  -- Get latest prediction for this lead/campaign
  select coalesce(predicted_value, 0)
  into v_predicted_interest
  from public.predictions
  where workspace_id = p_workspace_id
    and metric = 'interested_rate'
    and (
      campaign_id in (select campaign_id from public.leads where id = p_lead_id)
      or campaign_id is null
    )
  order by created_at desc
  limit 1;
  
  v_score := v_score + least(v_predicted_interest * 10, 10)::int;
  
  -- Revenue history (0-10 points)
  -- Check if similar leads have generated revenue
  select case
    when exists (
      select 1 from public.deals d
      join public.leads l on l.id = d.lead_id
      where d.workspace_id = p_workspace_id
        and d.status = 'won'
        and (
          (v_lead.company is not null and l.company = v_lead.company)
          or (v_lead.title is not null and l.title ilike '%' || split_part(v_lead.title, ' ', 1) || '%')
        )
    ) then 10
    else 0
  end into v_revenue_history_score;
  
  -- Calculate final score
  v_score := v_industry_match + v_company_size_match + v_title_match + 
             v_segment_performance::int + v_reply_intent_score + 
             v_revenue_history_score;
  
  -- Cap at 100
  v_score := least(v_score, 100);
  
  return v_score;
end;
$$;

-- ============================================================================
-- 5️⃣ Function — Calculate Priority Tier
-- ============================================================================

create or replace function public.calculate_priority_tier(
  p_icp_score int,
  p_predicted_interest float default null,
  p_reply_intent text default null
)
returns text
language plpgsql
immutable
as $$
declare
  v_priority text;
begin
  -- High-intent reply overrides everything
  if p_reply_intent = 'interested' then
    return 'A';
  end if;
  
  -- Use ICP score primarily
  if p_icp_score >= 80 then
    v_priority := 'A';
  elsif p_icp_score >= 50 then
    v_priority := 'B';
  else
    v_priority := 'C';
  end if;
  
  -- Boost priority if predicted interest is high
  if p_predicted_interest is not null and p_predicted_interest > 0.9 and v_priority = 'B' then
    v_priority := 'A';
  end if;
  
  return v_priority;
end;
$$;

-- ============================================================================
-- 6️⃣ Function — Get Best SDRs for Lead
-- ============================================================================

create or replace function public.get_best_sdrs_for_lead(
  p_lead_id uuid,
  p_workspace_id uuid,
  p_limit int default 3
)
returns table (
  sdr_id uuid,
  sdr_email text,
  sdr_name text,
  specialization_match boolean,
  performance_score float,
  workload_score float,
  total_score float
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_lead_industry text;
  v_lead_title text;
begin
  -- Get lead data
  select l.*, le.reply_intent
  into v_lead
  from public.leads l
  left join public.lead_engagement le on le.lead_id = l.id
  where l.id = p_lead_id;
  
  if v_lead is null then
    return;
  end if;
  
  v_lead_industry := coalesce(v_lead.company, '');
  v_lead_title := coalesce(v_lead.title, '');
  
  -- Return SDRs with scoring
  return query
  select 
    p.id as sdr_id,
    p.email as sdr_email,
    p.full_name as sdr_name,
    case when p.specialization is not null and (
      v_lead_industry ilike '%' || p.specialization || '%'
      or v_lead_title ilike '%' || p.specialization || '%'
    ) then true else false end as specialization_match,
    
    -- Performance score: meetings booked + revenue generated
    coalesce((
      select (count(distinct m.id) * 2.0 + coalesce(sum(d.value), 0) / 1000.0)
      from public.meetings m
      left join public.deals d on d.meeting_id = m.id and d.status = 'won'
      where m.owner_id = p.id
        and m.workspace_id = p_workspace_id
        and m.booked_at >= now() - interval '30 days'
    ), 0.0) as performance_score,
    
    -- Workload score: inverse of current lead count (lower is better, but we want higher score)
    greatest(100.0 - (
      select count(*)::float
      from public.leads l
      where l.owner_id = p.id
        and l.workspace_id = p_workspace_id
        and l.status not in ('replied', 'unsubscribed', 'bounced')
    ), 0.0) as workload_score,
    
    -- Total score
    (
      case when p.specialization is not null and (
        v_lead_industry ilike '%' || p.specialization || '%'
        or v_lead_title ilike '%' || p.specialization || '%'
      ) then 50.0 else 0.0 end +
      coalesce((
        select (count(distinct m.id) * 2.0 + coalesce(sum(d.value), 0) / 1000.0)
        from public.meetings m
        left join public.deals d on d.meeting_id = m.id and d.status = 'won'
        where m.owner_id = p.id
          and m.workspace_id = p_workspace_id
          and m.booked_at >= now() - interval '30 days'
      ), 0.0) +
      greatest(100.0 - (
        select count(*)::float
        from public.leads l
        where l.owner_id = p.id
          and l.workspace_id = p_workspace_id
          and l.status not in ('replied', 'unsubscribed', 'bounced')
      ), 0.0)
    ) as total_score
    
  from public.profiles p
  join public.workspace_members wm on wm.user_id = p.id
  where wm.workspace_id = p_workspace_id
    and wm.role in ('owner', 'admin', 'member')
  order by total_score desc
  limit p_limit;
end;
$$;

-- ============================================================================
-- 7️⃣ Function — Get Best Inboxes for Lead
-- ============================================================================

create or replace function public.get_best_inboxes_for_lead(
  p_lead_id uuid,
  p_workspace_id uuid,
  p_limit int default 3
)
returns table (
  inbox_id uuid,
  inbox_email text,
  domain text,
  health_score int,
  reply_rate float,
  sending_capacity int,
  industry_match boolean,
  total_score float
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_lead_industry text;
begin
  -- Get lead data
  select l.*
  into v_lead
  from public.leads l
  where l.id = p_lead_id;
  
  if v_lead is null then
    return;
  end if;
  
  v_lead_industry := coalesce(v_lead.company, '');
  
  -- Return inboxes with scoring
  return query
  select 
    si.id as inbox_id,
    si.email as inbox_email,
    sd.domain as domain,
    coalesce(ih.health_score, 50) as health_score,
    coalesce(ih.reply_rate, 0.0) as reply_rate,
    coalesce(si.daily_limit, 100) as sending_capacity,
    
    -- Industry match (simplified - check if domain/email contains industry keywords)
    case when v_lead_industry is not null and (
      si.email ilike '%' || lower(v_lead_industry) || '%'
      or sd.domain ilike '%' || lower(v_lead_industry) || '%'
    ) then true else false end as industry_match,
    
    -- Total score: health (40%) + reply rate (30%) + capacity (20%) + industry match (10%)
    (
      coalesce(ih.health_score, 50) * 0.4 +
      coalesce(ih.reply_rate, 0.0) * 100 * 0.3 +
      least(coalesce(si.daily_limit, 100) / 100.0, 1.0) * 20 +
      case when v_lead_industry is not null and (
        si.email ilike '%' || lower(v_lead_industry) || '%'
        or sd.domain ilike '%' || lower(v_lead_industry) || '%'
      ) then 10 else 0 end
    ) as total_score
    
  from public.sender_inboxes si
  join public.sender_domains sd on sd.id = si.domain_id
  left join public.inbox_health ih on ih.inbox_id = si.id
  where si.workspace_id = p_workspace_id
    and si.connected = true
    and (ih.is_paused is null or ih.is_paused = false)
  order by total_score desc
  limit p_limit;
end;
$$;

-- ============================================================================
-- 8️⃣ Function — Evaluate Routing Rules
-- ============================================================================

create or replace function public.evaluate_routing_rules(
  p_lead_id uuid,
  p_workspace_id uuid
)
returns table (
  rule_id uuid,
  matched boolean,
  assigned_inbox_id uuid,
  assigned_owner_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_rule record;
  v_field_value text;
  v_matched boolean;
begin
  -- Get lead data
  select 
    l.*,
    le.reply_intent,
    le.reply_confidence,
    coalesce(l.icp_score, 0) as icp_score,
    l.priority
  into v_lead
  from public.leads l
  left join public.lead_engagement le on le.lead_id = l.id
  where l.id = p_lead_id;
  
  if v_lead is null then
    return;
  end if;
  
  -- Evaluate rules in priority order
  for v_rule in
    select *
    from public.routing_rules
    where workspace_id = p_workspace_id
      and is_active = true
    order by priority asc, created_at asc
  loop
    v_matched := false;
    v_field_value := null;
    
    -- Get field value based on rule field
    case v_rule.field
      when 'industry' then
        v_field_value := v_lead.company;
      when 'job_title' then
        v_field_value := v_lead.title;
      when 'country' then
        v_field_value := coalesce((v_lead.custom->>'country')::text, '');
      when 'icp_score' then
        v_field_value := coalesce(v_lead.icp_score::text, '0');
      when 'priority' then
        v_field_value := coalesce(v_lead.priority, 'C');
      when 'predicted_interest' then
        select coalesce(predicted_value::text, '0')
        into v_field_value
        from public.predictions
        where workspace_id = p_workspace_id
          and metric = 'interested_rate'
        order by created_at desc
        limit 1;
      when 'reply_intent' then
        v_field_value := coalesce(v_lead.reply_intent, '');
      else
        v_field_value := coalesce((v_lead.custom->>v_rule.field)::text, '');
    end case;
    
    -- Evaluate operator
    case v_rule.operator
      when 'equals' then
        v_matched := v_field_value = v_rule.value;
      when 'contains' then
        v_matched := v_field_value ilike '%' || v_rule.value || '%';
      when '>' then
        v_matched := (v_field_value::numeric) > (v_rule.value::numeric);
      when '>=' then
        v_matched := (v_field_value::numeric) >= (v_rule.value::numeric);
      when '<' then
        v_matched := (v_field_value::numeric) < (v_rule.value::numeric);
      when '<=' then
        v_matched := (v_field_value::numeric) <= (v_rule.value::numeric);
      when 'in' then
        v_matched := v_field_value = any(string_to_array(v_rule.value, ','));
      when 'not_in' then
        v_matched := not (v_field_value = any(string_to_array(v_rule.value, ',')));
      else
        v_matched := false;
    end case;
    
    -- Return matched rule
    if v_matched then
      return query select 
        v_rule.id as rule_id,
        true as matched,
        case when v_rule.assign_to_type in ('inbox', 'both') then v_rule.inbox_id else null end as assigned_inbox_id,
        case when v_rule.assign_to_type in ('sdr', 'both') then v_rule.owner_id else null end as assigned_owner_id;
      return; -- Exit after first match
    end if;
  end loop;
  
  -- No match
  return query select 
    null::uuid as rule_id,
    false as matched,
    null::uuid as assigned_inbox_id,
    null::uuid as assigned_owner_id;
end;
$$;

-- ============================================================================
-- 9️⃣ Function — Route Lead (Main Entry Point)
-- ============================================================================

create or replace function public.route_lead(
  p_lead_id uuid,
  p_workspace_id uuid,
  p_force_recalculate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_icp_score int;
  v_priority text;
  v_rule_result record;
  v_best_sdr record;
  v_best_inbox record;
  v_assigned_owner_id uuid;
  v_assigned_inbox_id uuid;
  v_reasons text[] := array[]::text[];
  v_result jsonb;
begin
  -- Get lead
  select *
  into v_lead
  from public.leads
  where id = p_lead_id
    and workspace_id = p_workspace_id;
  
  if v_lead is null then
    return jsonb_build_object('error', 'Lead not found');
  end if;
  
  -- Calculate or get ICP score
  if p_force_recalculate or v_lead.icp_score is null then
    v_icp_score := public.calculate_icp_score(p_lead_id, p_workspace_id);
    
    -- Update lead with ICP score
    update public.leads
    set icp_score = v_icp_score
    where id = p_lead_id;
  else
    v_icp_score := v_lead.icp_score;
  end if;
  
  -- Calculate priority
  select public.calculate_priority_tier(
    v_icp_score,
    null, -- predicted_interest (can be enhanced)
    (select reply_intent from public.lead_engagement where lead_id = p_lead_id)
  ) into v_priority;
  
  -- Update lead with priority
  update public.leads
  set priority = v_priority
  where id = p_lead_id;
  
  -- Evaluate routing rules first
  select * into v_rule_result
  from public.evaluate_routing_rules(p_lead_id, p_workspace_id)
  limit 1;
  
  if v_rule_result.matched then
    v_assigned_owner_id := v_rule_result.assigned_owner_id;
    v_assigned_inbox_id := v_rule_result.assigned_inbox_id;
    v_reasons := array_append(v_reasons, format('Matched routing rule: %s', v_rule_result.rule_id));
  else
    -- No rule matched, use AI routing
    
    -- Get best SDRs
    select * into v_best_sdr
    from public.get_best_sdrs_for_lead(p_lead_id, p_workspace_id, 1)
    limit 1;
    
    if v_best_sdr is not null then
      v_assigned_owner_id := v_best_sdr.sdr_id;
      v_reasons := array_append(v_reasons, format('AI routing: Best SDR match (score: %.2f)', v_best_sdr.total_score));
      
      if v_best_sdr.specialization_match then
        v_reasons := array_append(v_reasons, 'SDR specialization matched');
      end if;
    end if;
    
    -- Get best inboxes
    select * into v_best_inbox
    from public.get_best_inboxes_for_lead(p_lead_id, p_workspace_id, 1)
    limit 1;
    
    if v_best_inbox is not null then
      v_assigned_inbox_id := v_best_inbox.inbox_id;
      v_reasons := array_append(v_reasons, format('AI routing: Best inbox match (health: %s, score: %.2f)', v_best_inbox.health_score, v_best_inbox.total_score));
      
      if v_best_inbox.industry_match then
        v_reasons := array_append(v_reasons, 'Inbox industry specialization matched');
      end if;
    end if;
  end if;
  
  -- Assign owner if found
  if v_assigned_owner_id is not null and (v_lead.owner_id is null or p_force_recalculate) then
    update public.leads
    set owner_id = v_assigned_owner_id
    where id = p_lead_id;
    
    -- Log assignment
    insert into public.lead_assignment_log (
      lead_id, workspace_id, assigned_to, assignment_type, reason
    ) values (
      p_lead_id, p_workspace_id, v_assigned_owner_id, 'auto',
      array_to_string(v_reasons, '; ')
    );
  end if;
  
  -- Build result
  v_result := jsonb_build_object(
    'icp_score', v_icp_score,
    'priority', v_priority,
    'assigned_owner_id', v_assigned_owner_id,
    'assigned_inbox_id', v_assigned_inbox_id,
    'reasons', v_reasons,
    'best_sdrs', (
      select jsonb_agg(jsonb_build_object(
        'sdr_id', sdr_id,
        'email', sdr_email,
        'name', sdr_name,
        'score', total_score
      ))
      from public.get_best_sdrs_for_lead(p_lead_id, p_workspace_id, 3)
    ),
    'best_inboxes', (
      select jsonb_agg(jsonb_build_object(
        'inbox_id', inbox_id,
        'email', inbox_email,
        'health_score', health_score,
        'score', total_score
      ))
      from public.get_best_inboxes_for_lead(p_lead_id, p_workspace_id, 3)
    )
  );
  
  -- Log activity
  begin
    perform public.log_activity(
      null, -- account_id
      null, -- campaign_id
      null, -- actor_user_id
      'system', -- actor_role
      'update', -- action
      'lead', -- entity_type
      p_lead_id, -- entity_id
      null, -- entity_name
      jsonb_build_object(
        'routing', 'intent_router_v2',
        'icp_score', v_icp_score,
        'priority', v_priority,
        'assigned_owner_id', v_assigned_owner_id,
        'assigned_inbox_id', v_assigned_inbox_id,
        'reasons', v_reasons
      )
    );
  exception when others then
    null; -- Activity log might not exist, ignore
  end;
  
  return v_result;
end;
$$;

-- ============================================================================
-- 🔟 Trigger — Auto-Route on Lead Events
-- ============================================================================

create or replace function public.trigger_lead_routing()
returns trigger
language plpgsql
as $$
begin
  -- Route lead when:
  -- 1. New lead is created
  -- 2. Lead is enriched (custom fields updated)
  -- 3. Lead gets added to segment
  -- 4. Lead replies (reply_intent changes)
  -- 5. Lead priority changes
  
  if new.workspace_id is not null then
    -- Use pg_notify or direct call (for now, direct call)
    -- In production, consider using pg_notify + LISTEN for async processing
    perform public.route_lead(new.id, new.workspace_id, false);
  end if;
  
  return new;
end;
$$;

-- Create trigger for new leads
drop trigger if exists trg_lead_routing_insert on public.leads;
create trigger trg_lead_routing_insert
after insert on public.leads
for each row
when (new.workspace_id is not null)
execute function public.trigger_lead_routing();

-- Create trigger for lead updates (when enrichment happens)
drop trigger if exists trg_lead_routing_update on public.leads;
create trigger trg_lead_routing_update
after update on public.leads
for each row
when (
  new.workspace_id is not null
  and (
    old.custom is distinct from new.custom
    or old.company is distinct from new.company
    or old.title is distinct from new.title
  )
)
execute function public.trigger_lead_routing();

-- ============================================================================
-- 1️⃣1️⃣ Trigger — Route on Reply Intent Change
-- ============================================================================

create or replace function public.trigger_reply_intent_routing()
returns trigger
language plpgsql
as $$
declare
  v_lead_id uuid;
  v_workspace_id uuid;
begin
  -- When reply intent is detected, immediately route
  if new.reply_intent = 'interested' and (old.reply_intent is null or old.reply_intent != 'interested') then
    -- Get lead info
    select l.id, l.workspace_id
    into v_lead_id, v_workspace_id
    from public.leads l
    where l.id = new.lead_id;
    
    if v_lead_id is not null and v_workspace_id is not null then
      -- Route to best SDR immediately
      perform public.route_lead(v_lead_id, v_workspace_id, true);
    end if;
  end if;
  
  return new;
end;
$$;

-- Create trigger on lead_engagement
drop trigger if exists trg_reply_intent_routing on public.lead_engagement;
create trigger trg_reply_intent_routing
after insert or update on public.lead_engagement
for each row
when (new.reply_intent = 'interested')
execute function public.trigger_reply_intent_routing();

-- ============================================================================
-- 1️⃣2️⃣ Function — Get Routing Summary (for Dashboard)
-- ============================================================================

create or replace function public.get_routing_summary(
  p_workspace_id uuid,
  p_days int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'total_routed', (
      select count(*)
      from public.leads
      where workspace_id = p_workspace_id
        and created_at >= now() - (p_days || ' days')::interval
        and owner_id is not null
    ),
    'distribution_per_sdr', (
      select jsonb_object_agg(
        coalesce(p.email, 'unassigned'),
        count(*)
      )
      from public.leads l
      left join public.profiles p on p.id = l.owner_id
      where l.workspace_id = p_workspace_id
        and l.created_at >= now() - (p_days || ' days')::interval
      group by l.owner_id, p.email
    ),
    'distribution_per_inbox', (
      select jsonb_object_agg(
        coalesce(si.email, 'unassigned'),
        count(*)
      )
      from public.send_queue sq
      join public.leads l on l.id = sq.lead_id
      left join public.sender_inboxes si on si.id = sq.sender_inbox_id
      where l.workspace_id = p_workspace_id
        and sq.created_at >= now() - (p_days || ' days')::interval
      group by sq.sender_inbox_id, si.email
    ),
    'priority_breakdown', (
      select jsonb_object_agg(
        coalesce(priority, 'unassigned'),
        count(*)
      )
      from public.leads
      where workspace_id = p_workspace_id
        and created_at >= now() - (p_days || ' days')::interval
      group by priority
    ),
    'avg_icp_score', (
      select coalesce(avg(icp_score), 0)
      from public.leads
      where workspace_id = p_workspace_id
        and created_at >= now() - (p_days || ' days')::interval
        and icp_score is not null
    )
  ) into v_result;
  
  return v_result;
end;
$$;

-- ============================================================================
-- 1️⃣3️⃣ Grant Permissions
-- ============================================================================

grant execute on function public.calculate_icp_score(uuid, uuid) to authenticated;
grant execute on function public.calculate_priority_tier(int, float, text) to authenticated;
grant execute on function public.get_best_sdrs_for_lead(uuid, uuid, int) to authenticated;
grant execute on function public.get_best_inboxes_for_lead(uuid, uuid, int) to authenticated;
grant execute on function public.evaluate_routing_rules(uuid, uuid) to authenticated;
grant execute on function public.route_lead(uuid, uuid, boolean) to authenticated;
grant execute on function public.get_routing_summary(uuid, int) to authenticated;

-- ============================================================================
-- Block 458 — Intent Router v2 Complete
-- ============================================================================



