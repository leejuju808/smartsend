-- =========================================================
-- Block 15600 — SmartSend List Intelligence v1
-- (The System That Classifies Every List: Storm, Old Quotes, Insurance, Neighborhood, Bad Quality, & Priority Ranking)
-- =========================================================

-- ============================================
-- 1) Add Intelligence Fields to contact_lists
-- ============================================

alter table public.contact_lists
  add column if not exists list_type text check (
    list_type in (
      'storm_leads',
      'old_quotes',
      'insurance_interest',
      'neighborhood_list',
      'low_quality_leads',
      'commercial_leads',
      'website_leads',
      'unknown'
    )
  ) default 'unknown',
  add column if not exists priority_score integer check (
    priority_score >= 0 and priority_score <= 100
  ) default null,
  add column if not exists storm_count integer default 0,
  add column if not exists insurance_count integer default 0,
  add column if not exists old_quote_count integer default 0,
  add column if not exists estimated_revenue numeric(12,2) default null,
  add column if not exists low_quality_flag boolean default false,
  add column if not exists commercial_flag boolean default false,
  add column if not exists total_contacts integer default 0,
  add column if not exists valid_emails integer default 0,
  add column if not exists invalid_emails integer default 0,
  add column if not exists recommended_campaign_type text,
  add column if not exists intelligence_analyzed_at timestamptz,
  add column if not exists intelligence_version text default 'v1';

-- Indexes for filtering and sorting
create index if not exists idx_contact_lists_list_type on public.contact_lists(list_type);
create index if not exists idx_contact_lists_priority_score on public.contact_lists(priority_score desc nulls last);
create index if not exists idx_contact_lists_intelligence_analyzed_at on public.contact_lists(intelligence_analyzed_at desc);

-- ============================================
-- 2) List Intelligence Timeline Table
-- ============================================

create table if not exists public.list_intelligence_timeline (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.contact_lists(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'classification',
      'priority_update',
      'enrichment_update',
      'campaign_recommendation',
      'quality_check'
    )
  ),
  event_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_list_intelligence_timeline_list_id on public.list_intelligence_timeline(list_id);
create index if not exists idx_list_intelligence_timeline_workspace_id on public.list_intelligence_timeline(workspace_id);
create index if not exists idx_list_intelligence_timeline_created_at on public.list_intelligence_timeline(created_at desc);

-- Enable RLS
alter table public.list_intelligence_timeline enable row level security;

-- RLS Policies for timeline
create policy "list_intelligence_timeline_select" on public.list_intelligence_timeline
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- ============================================
-- 3) List Intelligence Classification Function
-- ============================================

create or replace function public.classify_list_intelligence(
  p_list_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_list public.contact_lists%rowtype;
  v_contacts jsonb;
  v_classification jsonb;
  v_list_type text := 'unknown';
  v_priority_score integer := 0;
  v_storm_count integer := 0;
  v_insurance_count integer := 0;
  v_old_quote_count integer := 0;
  v_total_contacts integer := 0;
  v_valid_emails integer := 0;
  v_invalid_emails integer := 0;
  v_low_quality_flag boolean := false;
  v_commercial_flag boolean := false;
  v_estimated_revenue numeric(12,2) := null;
  v_recommended_campaign_type text := null;
  v_zip_clusters jsonb;
  v_email_domains jsonb;
  v_has_quote_amounts boolean := false;
  v_has_insurance_keywords boolean := false;
  v_has_storm_proximity boolean := false;
  v_zip_range_size integer;
  v_contact_record record;
begin
  -- Get list info
  select * into v_list
  from public.contact_lists
  where id = p_list_id;
  
  if not found then
    return jsonb_build_object('error', 'List not found');
  end if;
  
  -- Get all contacts in this list with their data
  -- Note: tags field may be text[] or jsonb, we'll handle both in the loop
  select 
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'email', c.email,
        'first_name', c.first_name,
        'last_name', c.last_name,
        'city', c.city,
        'state', c.state,
        'zip', c.zip,
        'phone', c.phone,
        'notes', c.notes,
        'tags', coalesce(to_jsonb(c.tags), '[]'::jsonb),
        'company', c.company
      )
    ) into v_contacts
  from public.contacts c
  inner join public.contact_list_members clm on c.id = clm.contact_id
  where clm.list_id = p_list_id;
  
  if v_contacts is null then
    v_contacts := '[]'::jsonb;
  end if;
  
  v_total_contacts := jsonb_array_length(v_contacts);
  
  -- Analyze contacts
  for v_contact_record in 
    select * from jsonb_array_elements(v_contacts)
  loop
    declare
      v_email text := v_contact_record->>'email';
      v_zip text := v_contact_record->>'zip';
      v_notes text := v_contact_record->>'notes';
      v_tags jsonb := v_contact_record->'tags';
      v_company text := v_contact_record->>'company';
      v_email_domain text;
      v_is_valid_email boolean;
    begin
      -- Email validation
      if v_email is not null and v_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
        v_valid_emails := v_valid_emails + 1;
        v_is_valid_email := true;
        
        -- Extract domain
        v_email_domain := lower(split_part(v_email, '@', 2));
        
        -- Check for commercial/business domains
        if v_email_domain ~* '(gmail|yahoo|hotmail|outlook|aol|icloud|protonmail)' then
          -- Personal email, likely homeowner
        else
          -- Could be business/commercial
          if v_company is not null and v_company != '' then
            v_commercial_flag := true;
          end if;
        end if;
        
        -- Check for insurance domains
        if v_email_domain ~* '(insurance|claims|adjuster|allstate|statefarm|geico|progressive|farmers|usaa|liberty)' then
          v_insurance_count := v_insurance_count + 1;
          v_has_insurance_keywords := true;
        end if;
      else
        v_invalid_emails := v_invalid_emails + 1;
        v_is_valid_email := false;
      end if;
      
      -- Check notes/tags for quote keywords
      if v_notes is not null then
        if v_notes ~* '(quote|quoted|estimate|job|previous|old|prior)' then
          v_has_quote_amounts := true;
          v_old_quote_count := v_old_quote_count + 1;
        end if;
        
        if v_notes ~* '(insurance|claim|adjuster|coverage)' then
          v_has_insurance_keywords := true;
          v_insurance_count := v_insurance_count + 1;
        end if;
      end if;
      
      -- Check tags for storm/insurance indicators
      -- Tags can be jsonb array or text array, handle both
      if v_tags is not null then
        declare
          v_tags_text text;
        begin
          -- Convert to text for pattern matching
          if jsonb_typeof(v_tags) = 'array' then
            v_tags_text := v_tags::text;
          elsif jsonb_typeof(v_tags) = 'string' then
            v_tags_text := v_tags::text;
          else
            v_tags_text := coalesce(v_tags::text, '');
          end if;
          
          if v_tags_text ~* '(storm|hail|wind|damage)' then
            v_storm_count := v_storm_count + 1;
          end if;
          if v_tags_text ~* '(insurance|claim)' then
            v_has_insurance_keywords := true;
            v_insurance_count := v_insurance_count + 1;
          end if;
        end;
      end if;
      
      -- Check zip codes for storm regions (using zip_storm_regions table if available)
      if v_zip is not null and length(v_zip) >= 5 then
        declare
          v_zip_prefix text := substring(v_zip from '^(\d{5})');
          v_storm_risk text;
        begin
          select storm_risk_level into v_storm_risk
          from public.zip_storm_regions
          where zip_code = v_zip_prefix
          limit 1;
          
          if v_storm_risk is not null and v_storm_risk != 'low' then
            v_storm_count := v_storm_count + 1;
            v_has_storm_proximity := true;
          end if;
        exception when others then
          -- Table might not exist, skip
        end;
      end if;
    end;
  end loop;
  
  -- Calculate quality metrics
  if v_total_contacts > 0 then
    declare
      v_invalid_email_pct numeric := (v_invalid_emails::numeric / v_total_contacts::numeric) * 100;
      v_missing_name_pct numeric;
      v_missing_names integer := 0;
    begin
      -- Count missing names
      select count(*) into v_missing_names
      from jsonb_array_elements(v_contacts) c
      where (c->>'first_name') is null or (c->>'first_name') = ''
         or (c->>'last_name') is null or (c->>'last_name') = '';
      
      v_missing_name_pct := (v_missing_names::numeric / v_total_contacts::numeric) * 100;
      
      -- Flag as low quality if > 15% invalid emails or > 40% missing names
      if v_invalid_email_pct > 15 or v_missing_name_pct > 40 then
        v_low_quality_flag := true;
      end if;
    end;
  end if;
  
  -- Analyze zip clustering (query contacts directly for better performance)
  declare
    v_zip_rec record;
    v_min_zip_val integer := null;
    v_max_zip_val integer := null;
  begin
    for v_zip_rec in
      select distinct substring(c.zip from '^(\d{5})') as zip_code
      from public.contacts c
      inner join public.contact_list_members clm on c.id = clm.contact_id
      where clm.list_id = p_list_id
        and c.zip is not null
        and length(c.zip) >= 5
    loop
      declare
        v_zip_int integer;
      begin
        v_zip_int := v_zip_rec.zip_code::integer;
        if v_min_zip_val is null or v_zip_int < v_min_zip_val then
          v_min_zip_val := v_zip_int;
        end if;
        if v_max_zip_val is null or v_zip_int > v_max_zip_val then
          v_max_zip_val := v_zip_int;
        end if;
      end;
    end loop;
    
    if v_min_zip_val is not null and v_max_zip_val is not null then
      v_zip_range_size := v_max_zip_val - v_min_zip_val;
    end if;
  end;
  
  -- CLASSIFICATION LOGIC
  
  -- 1. Storm List Detection
  if v_storm_count > 0 and v_total_contacts > 0 then
    declare
      v_storm_pct numeric := (v_storm_count::numeric / v_total_contacts::numeric) * 100;
    begin
      if v_storm_pct > 10 or (v_zip_range_size is not null and v_zip_range_size < 1000) then
        -- Tight zip clustering + storm indicators
        v_list_type := 'storm_leads';
        v_priority_score := 85 + least(10, floor(v_storm_pct / 10));
        v_recommended_campaign_type := 'Storm Damage Inspection Sequence';
      end if;
    end;
  end if;
  
  -- 2. Insurance Leads Detection
  if v_has_insurance_keywords and v_insurance_count > 0 and v_total_contacts > 0 then
    declare
      v_insurance_pct numeric := (v_insurance_count::numeric / v_total_contacts::numeric) * 100;
    begin
      if v_insurance_pct > 5 then
        if v_list_type = 'unknown' then
          v_list_type := 'insurance_interest';
          v_priority_score := 80 + least(10, floor(v_insurance_pct / 5));
          v_recommended_campaign_type := 'Insurance Claim Help Sequence';
        end if;
      end if;
    end;
  end if;
  
  -- 3. Old Quotes Detection
  if v_has_quote_amounts and v_old_quote_count > 0 then
    if v_list_type = 'unknown' then
      v_list_type := 'old_quotes';
      v_priority_score := 70 + least(15, floor((v_old_quote_count::numeric / greatest(v_total_contacts, 1)::numeric) * 100 / 10));
      v_recommended_campaign_type := 'Re-Quote Sequence: 3-Step Reviver';
    end if;
  end if;
  
  -- 4. Neighborhood List Detection
  if v_zip_range_size is not null and v_zip_range_size < 500 and v_total_contacts > 10 then
    if v_list_type = 'unknown' then
      v_list_type := 'neighborhood_list';
      v_priority_score := 60 + least(15, floor(v_total_contacts / 10));
      v_recommended_campaign_type := 'Local Neighborhood Outreach';
    end if;
  end if;
  
  -- 5. Website/Form Leads Detection
  if v_valid_emails > 0 and v_total_contacts > 0 then
    declare
      v_valid_email_pct numeric := (v_valid_emails::numeric / v_total_contacts::numeric) * 100;
      v_has_clean_data boolean := false;
    begin
      -- Check if data looks clean and structured (high valid email %, names present)
      if v_valid_email_pct > 90 and v_missing_name_pct < 20 then
        v_has_clean_data := true;
      end if;
      
      if v_has_clean_data and v_list_type = 'unknown' then
        v_list_type := 'website_leads';
        v_priority_score := 65 + least(20, floor(v_valid_email_pct / 5));
        v_recommended_campaign_type := 'Welcome Sequence';
      end if;
    end;
  end if;
  
  -- 6. Commercial List Detection
  if v_commercial_flag then
    if v_list_type = 'unknown' then
      v_list_type := 'commercial_leads';
      v_priority_score := 20;
      v_recommended_campaign_type := null; -- Warn user instead
    end if;
  end if;
  
  -- 7. Low Quality Detection
  if v_low_quality_flag then
    if v_list_type = 'unknown' then
      v_list_type := 'low_quality_leads';
      v_priority_score := 30;
    else
      -- Reduce priority score if low quality
      v_priority_score := greatest(10, v_priority_score - 20);
    end if;
  end if;
  
  -- Calculate estimated revenue (rough estimate)
  -- Storm leads: $5k avg per job, 5% conversion = $250 per contact
  -- Insurance: $8k avg per job, 8% conversion = $640 per contact
  -- Old quotes: $6k avg per job, 10% conversion = $600 per contact
  -- Neighborhood: $4k avg per job, 3% conversion = $120 per contact
  case v_list_type
    when 'storm_leads' then
      v_estimated_revenue := v_total_contacts * 250;
    when 'insurance_interest' then
      v_estimated_revenue := v_total_contacts * 640;
    when 'old_quotes' then
      v_estimated_revenue := v_total_contacts * 600;
    when 'neighborhood_list' then
      v_estimated_revenue := v_total_contacts * 120;
    when 'website_leads' then
      v_estimated_revenue := v_total_contacts * 200;
    else
      v_estimated_revenue := v_total_contacts * 100; -- Generic estimate
  end case;
  
  -- Update list with intelligence data
  update public.contact_lists
  set
    list_type = v_list_type,
    priority_score = v_priority_score,
    storm_count = v_storm_count,
    insurance_count = v_insurance_count,
    old_quote_count = v_old_quote_count,
    estimated_revenue = v_estimated_revenue,
    low_quality_flag = v_low_quality_flag,
    commercial_flag = v_commercial_flag,
    total_contacts = v_total_contacts,
    valid_emails = v_valid_emails,
    invalid_emails = v_invalid_emails,
    recommended_campaign_type = v_recommended_campaign_type,
    intelligence_analyzed_at = now(),
    intelligence_version = 'v1'
  where id = p_list_id;
  
  -- Log to timeline
  insert into public.list_intelligence_timeline (
    list_id,
    workspace_id,
    event_type,
    event_data
  ) values (
    p_list_id,
    v_list.workspace_id,
    'classification',
    jsonb_build_object(
      'list_type', v_list_type,
      'priority_score', v_priority_score,
      'storm_count', v_storm_count,
      'insurance_count', v_insurance_count,
      'old_quote_count', v_old_quote_count,
      'total_contacts', v_total_contacts,
      'valid_emails', v_valid_emails,
      'invalid_emails', v_invalid_emails,
      'low_quality_flag', v_low_quality_flag,
      'commercial_flag', v_commercial_flag,
      'recommended_campaign_type', v_recommended_campaign_type
    )
  );
  
  -- Return classification result
  return jsonb_build_object(
    'list_type', v_list_type,
    'priority_score', v_priority_score,
    'storm_count', v_storm_count,
    'insurance_count', v_insurance_count,
    'old_quote_count', v_old_quote_count,
    'total_contacts', v_total_contacts,
    'valid_emails', v_valid_emails,
    'invalid_emails', v_invalid_emails,
    'low_quality_flag', v_low_quality_flag,
    'commercial_flag', v_commercial_flag,
    'estimated_revenue', v_estimated_revenue,
    'recommended_campaign_type', v_recommended_campaign_type
  );
end;
$$;

-- ============================================
-- 4) Comments
-- ============================================

comment on column public.contact_lists.list_type is 'Automatically detected list type: storm_leads, old_quotes, insurance_interest, neighborhood_list, low_quality_leads, commercial_leads, website_leads, or unknown';
comment on column public.contact_lists.priority_score is 'Priority score from 0-100 indicating list value (higher = more valuable)';
comment on column public.contact_lists.storm_count is 'Number of contacts with storm indicators';
comment on column public.contact_lists.insurance_count is 'Number of contacts with insurance indicators';
comment on column public.contact_lists.old_quote_count is 'Number of contacts with old quote indicators';
comment on column public.contact_lists.estimated_revenue is 'Estimated potential revenue unlock from this list';
comment on column public.contact_lists.low_quality_flag is 'True if list has >15% invalid emails or >40% missing names';
comment on column public.contact_lists.commercial_flag is 'True if list contains commercial/business contacts';
comment on column public.contact_lists.recommended_campaign_type is 'Recommended campaign type based on list classification';
comment on table public.list_intelligence_timeline is 'Audit log of list intelligence classification events';

