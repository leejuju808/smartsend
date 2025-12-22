-- Block 469 — AI Research Agent v1
-- Website Scraper • Company Intel • Competitor Insights • Personalization Snippets • Auto-Research Pipeline
-- This block implements an AI-powered research agent that automatically analyzes leads' websites,
-- extracts company intelligence, identifies pain points, detects tech stacks and competitors,
-- and generates personalization snippets for use in sequences.

-- ============================================================================
-- 1️⃣ RESEARCH_CACHE TABLE
-- ============================================================================

create table if not exists public.research_cache (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  workspace_id uuid,
  brand_id uuid references public.brands(id) on delete set null,
  url text,
  
  -- Core research data
  company_summary text,
  pain_points text,
  tech_stack jsonb default '[]'::jsonb,
  competitors jsonb default '[]'::jsonb,
  personalization_snippets jsonb default '[]'::jsonb,
  
  -- Additional extracted data
  industry text,
  services text[] default '{}',
  geographic_info text,
  social_proof jsonb default '{}'::jsonb,
  ai_hooks jsonb default '{}'::jsonb, -- Email/SMS/LinkedIn hooks
  
  -- Quality metrics
  confidence numeric check (confidence >= 0 and confidence <= 1),
  updated_at timestamptz default now(),
  
  unique(lead_id)
);

-- Indexes for fast lookups
create index if not exists idx_research_cache_lead on public.research_cache(lead_id);
create index if not exists idx_research_cache_workspace on public.research_cache(workspace_id);
create index if not exists idx_research_cache_brand on public.research_cache(brand_id);
create index if not exists idx_research_cache_updated on public.research_cache(updated_at desc);

-- Trigger for updated_at
create trigger trg_research_cache_updated_at
before update on public.research_cache
for each row
execute function public.set_updated_at();

-- RLS Policies
alter table public.research_cache enable row level security;

create policy "research_cache_select_workspace_member" on public.research_cache
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = research_cache.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "research_cache_insert_service_role" on public.research_cache
  for insert with check (true);

create policy "research_cache_update_service_role" on public.research_cache
  for update using (true) with check (true);

-- ============================================================================
-- 2️⃣ HELPER FUNCTION: Get Research Data for Lead
-- ============================================================================

create or replace function public.get_lead_research(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_research jsonb;
begin
  select row_to_json(r.*)::jsonb
  into v_research
  from public.research_cache r
  where r.lead_id = p_lead_id;
  
  return coalesce(v_research, '{}'::jsonb);
end;
$$;

-- ============================================================================
-- 3️⃣ HELPER FUNCTION: Update ICP Score Based on Research
-- ============================================================================

create or replace function public.apply_research_to_icp_score(p_lead_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_research record;
  v_icp_score int;
  v_boost int := 0;
begin
  -- Get lead and research data
  select l.*, l.workspace_id
  into v_lead
  from public.leads l
  where l.id = p_lead_id;
  
  if v_lead is null then
    return 0;
  end if;
  
  select *
  into v_research
  from public.research_cache
  where lead_id = p_lead_id;
  
  if v_research is null then
    return coalesce(v_lead.icp_score, 0);
  end if;
  
  -- Get current ICP score
  v_icp_score := coalesce(v_lead.icp_score, 0);
  
  -- Boost based on research findings
  -- Industry match
  if v_research.industry is not null then
    -- Check if industry matches ICP (would need ICP config table)
    v_boost := v_boost + 5;
  end if;
  
  -- Tech stack signals
  if jsonb_array_length(coalesce(v_research.tech_stack, '[]'::jsonb)) > 0 then
    v_boost := v_boost + 3;
  end if;
  
  -- Pain points detected
  if v_research.pain_points is not null and length(v_research.pain_points) > 0 then
    v_boost := v_boost + 5;
  end if;
  
  -- Services/products detected
  if array_length(v_research.services, 1) > 0 then
    v_boost := v_boost + 2;
  end if;
  
  -- Update ICP score
  v_icp_score := least(100, v_icp_score + v_boost);
  
  update public.leads
  set icp_score = v_icp_score
  where id = p_lead_id;
  
  return v_icp_score;
end;
$$;

-- ============================================================================
-- 4️⃣ TRIGGER: Auto-trigger Research on Lead Creation/Update
-- ============================================================================

create or replace function public.trigger_research_agent()
returns trigger
language plpgsql
as $$
declare
  v_has_website boolean := false;
  v_has_domain boolean := false;
  v_has_linkedin boolean := false;
begin
  -- Check if lead has research triggers
  v_has_website := (new.website is not null and length(new.website) > 0);
  v_has_domain := (new.domain is not null and length(new.domain) > 0);
  v_has_linkedin := (new.linkedin is not null and length(new.linkedin) > 0);
  
  -- Only trigger if we have at least one research source
  if v_has_website or v_has_domain or v_has_linkedin then
    -- Queue research job via pg_notify (will be picked up by edge function or job runner)
    perform pg_notify('research_agent', json_build_object(
      'lead_id', new.id,
      'workspace_id', new.workspace_id,
      'brand_id', new.brand_id,
      'trigger', case when tg_op = 'INSERT' then 'lead_created' else 'lead_updated' end
    )::text);
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_leads_research_agent on public.leads;
create trigger trg_leads_research_agent
after insert or update of website, domain, linkedin on public.leads
for each row
when (
  (new.website is not null and length(new.website) > 0) or
  (new.domain is not null and length(new.domain) > 0) or
  (new.linkedin is not null and length(new.linkedin) > 0)
)
execute function public.trigger_research_agent();

-- ============================================================================
-- 4️⃣B TRIGGER: Auto-trigger Research on Enrichment Update
-- ============================================================================

create or replace function public.trigger_research_on_enrichment()
returns trigger
language plpgsql
as $$
declare
  v_lead record;
begin
  -- Get lead data
  select * into v_lead
  from public.leads
  where id = new.lead_id;
  
  if v_lead is null then
    return new;
  end if;
  
  -- Trigger research if enrichment found website/domain/LinkedIn
  if (new.company->>'website' is not null and length(new.company->>'website') > 0) or
     (new.company->>'domain' is not null and length(new.company->>'domain') > 0) or
     (new.person->>'linkedin' is not null and length(new.person->>'linkedin') > 0) then
    perform pg_notify('research_agent', json_build_object(
      'lead_id', new.lead_id,
      'workspace_id', v_lead.workspace_id,
      'brand_id', v_lead.brand_id,
      'trigger', 'enrichment_updated'
    )::text);
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_enrichment_research_agent on public.lead_enrichment;
create trigger trg_enrichment_research_agent
after insert or update on public.lead_enrichment
for each row
execute function public.trigger_research_on_enrichment();

-- ============================================================================
-- 5️⃣ ACTIVITY LOG INTEGRATION
-- ============================================================================

-- Log research agent activity to workspace_activity if table exists
create or replace function public.log_research_activity(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_event_type text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Log to workspace_activity if it exists
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'workspace_activity'
  ) then
    insert into public.workspace_activity (
      workspace_id,
      lead_id,
      event_type,
      description,
      metadata
    ) values (
      p_workspace_id,
      p_lead_id,
      p_event_type,
      p_message,
      p_metadata
    );
  end if;
end;
$$;

-- ============================================================================
-- 6️⃣ ROUTER V2 INTEGRATION: Research-Based Brand Routing
-- ============================================================================

-- Enhance route_lead function to consider research data for brand routing
-- This will be called after research is completed to re-route leads

create or replace function public.route_lead_with_research(p_lead_id uuid, p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_research record;
  v_brand_id uuid;
  v_reasons text[] := array[]::text[];
begin
  -- Get lead
  select * into v_lead
  from public.leads
  where id = p_lead_id and workspace_id = p_workspace_id;
  
  if v_lead is null then
    return jsonb_build_object('error', 'Lead not found');
  end if;
  
  -- Get research data
  select * into v_research
  from public.research_cache
  where lead_id = p_lead_id;
  
  if v_research is null then
    -- No research data, use standard routing
    return public.route_lead(p_lead_id, p_workspace_id, false);
  end if;
  
  -- Research-based brand routing logic
  -- Example: If website shows "roofing contractor" → route to Roofing brand
  if v_research.industry is not null then
    -- Check if industry matches any brand's target industry
    select id into v_brand_id
    from public.brands
    where workspace_id = p_workspace_id
      and (
        -- Check if brand has industry matching (would need brand.industry field)
        -- For now, we'll use a simple keyword match
        name ilike '%' || v_research.industry || '%'
        or name ilike '%' || lower(v_research.industry) || '%'
      )
    limit 1;
    
    if v_brand_id is not null then
      v_reasons := array_append(v_reasons, format('Industry match: %s', v_research.industry));
    end if;
  end if;
  
  -- Tech stack based routing
  if jsonb_array_length(coalesce(v_research.tech_stack, '[]'::jsonb)) > 0 then
    -- Could route to tech-specific brands
    -- For now, we'll just log it
    v_reasons := array_append(v_reasons, format('Tech stack detected: %s', 
      jsonb_array_length(coalesce(v_research.tech_stack, '[]'::jsonb))::text || ' technologies'));
  end if;
  
  -- Geographic routing
  if v_research.geographic_info is not null then
    -- Could route to geo-specific brands
    v_reasons := array_append(v_reasons, format('Geographic info: %s', v_research.geographic_info));
  end if;
  
  -- Update lead brand_id if we found a match
  if v_brand_id is not null and v_lead.brand_id is distinct from v_brand_id then
    update public.leads
    set brand_id = v_brand_id
    where id = p_lead_id;
    
    v_reasons := array_append(v_reasons, format('Brand reassigned to: %s', v_brand_id));
  end if;
  
  -- Call standard route_lead function
  return public.route_lead(p_lead_id, p_workspace_id, false);
end;
$$;

-- ============================================================================
-- 7️⃣ COMMENTS
-- ============================================================================

comment on table public.research_cache is 'AI Research Agent cache - stores website analysis, company intel, pain points, tech stack, competitors, and personalization snippets for each lead';
comment on column public.research_cache.company_summary is '2-3 sentence company summary generated by LLM';
comment on column public.research_cache.pain_points is 'Extracted pain points that match ICP';
comment on column public.research_cache.tech_stack is 'JSONB array of detected technologies';
comment on column public.research_cache.competitors is 'JSONB array of detected competitors';
comment on column public.research_cache.personalization_snippets is 'JSONB array of AI-generated personalization lines for email/SMS/LinkedIn';
comment on column public.research_cache.ai_hooks is 'JSONB object with hooks for different channels (email, sms, linkedin)';
comment on function public.route_lead_with_research is 'Enhanced routing function that considers research data for brand assignment';

