-- Block 433 — Smart Segments v2
-- (Advanced Segmentation • Score + Enrichment + Engagement + ICP Logic)

-- ============================================================================
-- 1. Schema Updates: Extend segment_rules table
-- ============================================================================

-- Create segment_rules table if it doesn't exist (normalized from segments.rule JSONB)
create table if not exists public.segment_rules (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.segments(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Rule type: score, enrichment, engagement, icp, boolean
  rule_type text not null check (rule_type in ('score', 'enrichment', 'engagement', 'icp', 'boolean')),
  
  -- Logical operator: AND, OR (for combining rules)
  logical_operator text default 'AND' check (logical_operator in ('AND', 'OR')),
  
  -- Rule order within segment
  rule_order int not null default 0,
  
  -- Score rules
  score_operator text check (score_operator in ('>', '>=', '<', '<=', '=', 'between')),
  score_value int,
  score_value_max int, -- for 'between' operator
  
  -- Enrichment rules
  enrichment_field text, -- title, seniority, industry, employee_count, revenue, country, tech_stack, linkedin_exists, timezone
  enrichment_operator text check (enrichment_operator in ('=', '!=', 'contains', 'not_contains', 'in', 'not_in', 'between', 'exists', 'not_exists')),
  enrichment_value text, -- single value
  enrichment_values text[], -- array for 'in', 'not_in'
  enrichment_value_min text, -- for 'between'
  enrichment_value_max text, -- for 'between'
  
  -- Engagement rules
  engagement_field text, -- opens, clicks, replies, replied_interested, bounced, spam_complaint, last_opened_days, last_reply_days
  engagement_operator text check (engagement_operator in ('>', '>=', '<', '<=', '=', 'between')),
  engagement_value int,
  engagement_value_max int, -- for 'between'
  
  -- ICP rules
  icp_match boolean default false, -- matches ideal customer profile
  
  -- Boolean rules (for simple true/false checks)
  boolean_field text, -- e.g., 'has_linkedin', 'is_enriched'
  boolean_value boolean,
  
  -- Metadata
  is_active boolean not null default true
);

create index if not exists idx_segment_rules_segment on public.segment_rules(segment_id, rule_order);
create index if not exists idx_segment_rules_type on public.segment_rules(rule_type, is_active);

-- Trigger to update updated_at
create trigger trg_segment_rules_updated_at
before update on public.segment_rules
for each row
execute function public.set_updated_at();

-- RLS for segment_rules
alter table public.segment_rules enable row level security;

create policy segment_rules_rw on public.segment_rules
  for all
  using (
    exists (
      select 1
      from public.segments s
      where s.id = segment_id
        and s.account_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.segments s
      where s.id = segment_id
        and s.account_id = auth.uid()
    )
  );

-- ============================================================================
-- 2. Helper Function: Build Rule SQL
-- ============================================================================

create or replace function public.build_rule_sql(p_rule public.segment_rules)
returns text
language plpgsql
immutable
as $$
declare
  v_sql text;
begin
  case p_rule.rule_type
    when 'score' then
      if p_rule.score_operator = 'between' then
        v_sql := format('coalesce(ls.score, 0) >= %s and coalesce(ls.score, 0) <= %s',
          coalesce(p_rule.score_value, 0),
          coalesce(p_rule.score_value_max, 100)
        );
      else
        v_sql := format('coalesce(ls.score, 0) %s %s',
          p_rule.score_operator,
          coalesce(p_rule.score_value, 0)
        );
      end if;
      
    when 'enrichment' then
      case p_rule.enrichment_operator
        when 'contains' then
          v_sql := format('lower(coalesce(le.%I, '''')) like %L',
            p_rule.enrichment_field,
            '%' || lower(p_rule.enrichment_value) || '%'
          );
        when 'not_contains' then
          v_sql := format('not (lower(coalesce(le.%I, '''')) like %L)',
            p_rule.enrichment_field,
            '%' || lower(p_rule.enrichment_value) || '%'
          );
        when 'in' then
          if p_rule.enrichment_field = 'tech_stack' or p_rule.enrichment_field = 'tech_tags' then
            -- For array fields, check overlap
            v_sql := format('coalesce(le.%I, ''{}'') && %L::text[]',
              p_rule.enrichment_field,
              p_rule.enrichment_values
            );
          else
            v_sql := format('le.%I = any(%L::text[])',
              p_rule.enrichment_field,
              p_rule.enrichment_values
            );
          end if;
        when 'not_in' then
          if p_rule.enrichment_field = 'tech_stack' or p_rule.enrichment_field = 'tech_tags' then
            v_sql := format('not (coalesce(le.%I, ''{}'') && %L::text[])',
              p_rule.enrichment_field,
              p_rule.enrichment_values
            );
          else
            v_sql := format('le.%I is null or le.%I <> all(%L::text[])',
              p_rule.enrichment_field,
              p_rule.enrichment_field,
              p_rule.enrichment_values
            );
          end if;
        when 'between' then
          if p_rule.enrichment_field in ('employee_count', 'company_employee_count') then
            v_sql := format('coalesce(le.%I, 0) >= %s and coalesce(le.%I, 0) <= %s',
              p_rule.enrichment_field,
              (p_rule.enrichment_value_min)::int,
              p_rule.enrichment_field,
              (p_rule.enrichment_value_max)::int
            );
          else
            v_sql := format('le.%I >= %L and le.%I <= %L',
              p_rule.enrichment_field,
              p_rule.enrichment_value_min,
              p_rule.enrichment_field,
              p_rule.enrichment_value_max
            );
          end if;
        when 'exists' then
          if p_rule.enrichment_field = 'linkedin_exists' then
            v_sql := format('le.linkedin_url is not null and length(trim(le.linkedin_url)) > 0');
          else
            v_sql := format('le.%I is not null', p_rule.enrichment_field);
          end if;
        when 'not_exists' then
          if p_rule.enrichment_field = 'linkedin_exists' then
            v_sql := format('(le.linkedin_url is null or length(trim(le.linkedin_url)) = 0)');
          else
            v_sql := format('le.%I is null', p_rule.enrichment_field);
          end if;
        else
          -- =, !=
          -- Handle timezone specially
          if p_rule.enrichment_field = 'timezone' and p_rule.enrichment_operator = '=' then
            -- Timezone might be in location field or separate timezone field
            v_sql := format('(le.timezone = %L or le.location ilike %L)',
              p_rule.enrichment_value,
              '%' || p_rule.enrichment_value || '%'
            );
          else
            v_sql := format('le.%I %s %L',
              p_rule.enrichment_field,
              p_rule.enrichment_operator,
              p_rule.enrichment_value
            );
          end if;
      end case;
      
    when 'engagement' then
      case p_rule.engagement_field
        when 'opens' then
          if p_rule.engagement_operator = 'between' then
            v_sql := format('coalesce(eng.opens, 0) >= %s and coalesce(eng.opens, 0) <= %s',
              coalesce(p_rule.engagement_value, 0),
              coalesce(p_rule.engagement_value_max, 999999)
            );
          else
            v_sql := format('coalesce(eng.opens, 0) %s %s',
              p_rule.engagement_operator,
              coalesce(p_rule.engagement_value, 0)
            );
          end if;
        when 'clicks' then
          if p_rule.engagement_operator = 'between' then
            v_sql := format('coalesce(eng.clicks, 0) >= %s and coalesce(eng.clicks, 0) <= %s',
              coalesce(p_rule.engagement_value, 0),
              coalesce(p_rule.engagement_value_max, 999999)
            );
          else
            v_sql := format('coalesce(eng.clicks, 0) %s %s',
              p_rule.engagement_operator,
              coalesce(p_rule.engagement_value, 0)
            );
          end if;
        when 'replies' then
          if p_rule.engagement_operator = 'between' then
            v_sql := format('coalesce(eng.replies, 0) >= %s and coalesce(eng.replies, 0) <= %s',
              coalesce(p_rule.engagement_value, 0),
              coalesce(p_rule.engagement_value_max, 999999)
            );
          else
            v_sql := format('coalesce(eng.replies, 0) %s %s',
              p_rule.engagement_operator,
              coalesce(p_rule.engagement_value, 0)
            );
          end if;
        when 'replied_interested' then
          v_sql := format('coalesce(eng.interested, 0) > 0');
        when 'bounced' then
          v_sql := format('coalesce(eng.bounces, 0) %s %s',
            p_rule.engagement_operator,
            coalesce(p_rule.engagement_value, 0)
          );
        when 'spam_complaint' then
          v_sql := format('coalesce(eng.spam, 0) %s %s',
            p_rule.engagement_operator,
            coalesce(p_rule.engagement_value, 0)
          );
        when 'last_opened_days' then
          v_sql := format('eng.last_open_at >= now() - interval ''%s days''',
            coalesce(p_rule.engagement_value, 30)
          );
        when 'last_reply_days' then
          v_sql := format('eng.last_reply_at >= now() - interval ''%s days''',
            coalesce(p_rule.engagement_value, 30)
          );
        else
          v_sql := 'true'; -- fallback
      end case;
      
    when 'icp' then
      -- ICP logic: matches ideal customer profile
      -- This will be expanded when ICP Builder is implemented
      -- For now, check if icp_fit column exists, otherwise use placeholder logic
      -- Future: This will check against ICP configuration table
      if p_rule.icp_match then
        -- Placeholder: ICP match logic will be implemented when ICP Builder is ready
        -- For now, return a condition that can be expanded
        v_sql := 'true'; -- Placeholder - will be replaced with actual ICP matching logic
      else
        v_sql := 'false';
      end if;
      
    when 'boolean' then
      case p_rule.boolean_field
        when 'has_linkedin' then
          v_sql := format('(le.linkedin_url is not null and length(trim(le.linkedin_url)) > 0) = %s', p_rule.boolean_value);
        when 'is_enriched' then
          v_sql := format('(le.lead_id is not null) = %s', p_rule.boolean_value);
        else
          v_sql := 'true'; -- fallback
      end case;
      
    else
      v_sql := 'true'; -- fallback
  end case;
  
  return v_sql;
end;
$$;

comment on function public.build_rule_sql(public.segment_rules) is 'Build SQL condition from segment rule';

-- ============================================================================
-- 3. Updated Segment Computation Function
-- ============================================================================

create or replace function public.recompute_segment_v2(p_segment_id uuid, p_limit int default 5000)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_count int;
  v_rules public.segment_rules[];
  v_rule public.segment_rules;
  v_sql_parts text[];
  v_final_sql text;
  v_rule_sql text;
begin
  -- Get segment account
  select account_id into v_account
  from public.segments
  where id = p_segment_id and is_active = true;
  
  if v_account is null then
    return 0;
  end if;
  
  -- Get all active rules for this segment
  select array_agg(r order by r.rule_order)
  into v_rules
  from public.segment_rules r
  where r.segment_id = p_segment_id
    and r.is_active = true;
  
  -- If no rules, clear members and return
  if v_rules is null or array_length(v_rules, 1) = 0 then
    delete from public.lead_segment_members
    where segment_id = p_segment_id;
    return 0;
  end if;
  
  -- Build SQL conditions for each rule
  v_sql_parts := array[]::text[];
  foreach v_rule in array v_rules
  loop
    v_rule_sql := public.build_rule_sql(v_rule);
    if v_rule_sql is not null and v_rule_sql != 'true' then
      v_sql_parts := array_append(v_sql_parts, '(' || v_rule_sql || ')');
    end if;
  end loop;
  
  -- Combine with logical operators
  if array_length(v_sql_parts, 1) = 0 then
    v_final_sql := 'true';
  else
    v_final_sql := array_to_string(v_sql_parts, ' AND ');
  end if;
  
  -- Clear existing members
  delete from public.lead_segment_members
  where segment_id = p_segment_id;
  
  -- Insert matching leads
  execute format('
    insert into public.lead_segment_members(segment_id, lead_id)
    select %L, l.id
    from public.leads l
    left join public.lead_enrichments le on le.lead_id = l.id
    left join public.lead_scores ls on ls.lead_id = l.id
    left join lateral (
      select
        coalesce(sum(case when type = ''open'' then 1 else 0 end), 0)::int as opens,
        coalesce(sum(case when type = ''click'' then 1 else 0 end), 0)::int as clicks,
        coalesce(count(*) filter (where event_type = ''reply''), 0)::int as replies,
        coalesce(count(*) filter (where event_type = ''reply'' and meta->>''intent'' = ''interested''), 0)::int as interested,
        coalesce(count(*) filter (where event_type = ''bounce''), 0)::int as bounces,
        coalesce(count(*) filter (where event_type = ''spam''), 0)::int as spam,
        max(case when type = ''open'' then created_at end) as last_open_at,
        max(case when event_type = ''reply'' then created_at end) as last_reply_at
      from (
        select ''open'' as type, null::text as event_type, null::jsonb as meta, created_at
        from public.lead_email_events
        where lead_id = l.id and type = ''open''
        union all
        select ''click'' as type, null::text as event_type, null::jsonb as meta, created_at
        from public.lead_email_events
        where lead_id = l.id and type = ''click''
        union all
        select null::text as type, event_type, meta, created_at
        from public.delivery_events
        where lead_id = l.id and event_type in (''reply'', ''bounce'', ''spam'')
        union all
        select null::text as type, event_type, meta, created_at
        from public.campaign_events
        where lead_id = l.id and event_type in (''reply'', ''bounce'', ''spam'')
      ) events
    ) eng on true
    where l.account_id = %L
      and (%s)
    limit %s
  ', p_segment_id, v_account, v_final_sql, p_limit);
  
  get diagnostics v_count = row_count;
  
  -- Update segment timestamp
  update public.segments
  set updated_at = now()
  where id = p_segment_id;
  
  return v_count;
end;
$$;

comment on function public.recompute_segment_v2(uuid, int) is 'Recompute segment members using v2 rule engine';

-- ============================================================================
-- 4. Real-Time Triggers for Segment Recomputation
-- ============================================================================

create or replace function public.recompute_segment_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_segment_ids uuid[];
begin
  -- Get account_id from the changed record
  if tg_table_name = 'lead_enrichments' then
    select l.account_id into v_account
    from public.leads l
    where l.id = coalesce(new.lead_id, old.lead_id);
  elsif tg_table_name = 'lead_scores' then
    select l.account_id into v_account
    from public.leads l
    where l.id = coalesce(new.lead_id, old.lead_id);
  elsif tg_table_name = 'lead_email_events' then
    select l.account_id into v_account
    from public.leads l
    where l.id = coalesce(new.lead_id, old.lead_id);
  elsif tg_table_name = 'delivery_events' then
    select l.account_id into v_account
    from public.leads l
    where l.id = coalesce(new.lead_id, old.lead_id);
  elsif tg_table_name = 'campaign_events' then
    select l.account_id into v_account
    from public.leads l
    where l.id = coalesce(new.lead_id, old.lead_id);
  else
    return coalesce(new, old);
  end if;
  
  if v_account is null then
    return coalesce(new, old);
  end if;
  
  -- Get all active segments for this account
  select array_agg(id) into v_segment_ids
  from public.segments
  where account_id = v_account
    and is_active = true;
  
  -- Recompute each segment (async-friendly, can be optimized with queue)
  if v_segment_ids is not null then
    perform public.recompute_segment_v2(seg_id, 100000)
    from unnest(v_segment_ids) as seg_id;
  end if;
  
  return coalesce(new, old);
end;
$$;

-- Drop existing triggers if they exist
drop trigger if exists trg_recompute_segment_on_enrichment on public.lead_enrichments;
drop trigger if exists trg_recompute_segment_on_score on public.lead_scores;
drop trigger if exists trg_recompute_segment_on_email_event on public.lead_email_events;
drop trigger if exists trg_recompute_segment_on_delivery_event on public.delivery_events;

-- Create triggers
create trigger trg_recompute_segment_on_enrichment
after insert or update on public.lead_enrichments
for each row execute function public.recompute_segment_on_change();

create trigger trg_recompute_segment_on_score
after insert or update on public.lead_scores
for each row execute function public.recompute_segment_on_change();

create trigger trg_recompute_segment_on_email_event
after insert on public.lead_email_events
for each row execute function public.recompute_segment_on_change();

create trigger trg_recompute_segment_on_delivery_event
after insert on public.delivery_events
for each row
when (new.event_type in ('reply', 'bounce', 'spam'))
execute function public.recompute_segment_on_change();

-- Also trigger on campaign_events for replies/bounces/spam
create trigger trg_recompute_segment_on_campaign_event
after insert on public.campaign_events
for each row
when (new.event_type in ('replied', 'bounced', 'spam'))
execute function public.recompute_segment_on_change();

-- ============================================================================
-- 5. Performance Indexes
-- ============================================================================

-- Enrichment indexes
create index if not exists idx_enrichment_industry on public.lead_enrichments(industry) where industry is not null;
create index if not exists idx_enrichment_seniority on public.lead_enrichments(seniority) where seniority is not null;
create index if not exists idx_enrichment_title on public.lead_enrichments(title) where title is not null;
create index if not exists idx_enrichment_employee_count on public.lead_enrichments(company_employee_count) where company_employee_count is not null;
create index if not exists idx_enrichment_country on public.lead_enrichments(country) where country is not null;
create index if not exists idx_enrichment_techstack on public.lead_enrichments using gin(tech_tags) where array_length(tech_tags, 1) > 0;
create index if not exists idx_enrichment_linkedin on public.lead_enrichments(linkedin_url) where linkedin_url is not null;

-- Score indexes
create index if not exists idx_lead_scores_score on public.lead_scores(score);
create index if not exists idx_lead_scores_computed_at on public.lead_scores(computed_at desc);

-- Engagement indexes (already exist but ensure they're there)
create index if not exists idx_email_events_lead_type on public.lead_email_events(lead_id, type);
create index if not exists idx_delivery_events_lead_type on public.delivery_events(lead_id, event_type);

-- ============================================================================
-- 6. Segment Preview View
-- ============================================================================

create or replace view public.v_segment_preview as
select
  s.id as segment_id,
  s.name as segment_name,
  s.account_id,
  l.id as lead_id,
  l.email,
  l.first_name,
  l.last_name,
  coalesce(ls.score, 0) as score,
  le.title,
  le.company_name as company,
  le.industry,
  coalesce(eng.opens, 0) as opens,
  coalesce(eng.clicks, 0) as clicks,
  coalesce(eng.replies, 0) as replies,
  coalesce(eng.interested, 0) as interested_replies,
  lsm.created_at as member_since
from public.segments s
join public.lead_segment_members lsm on lsm.segment_id = s.id
join public.leads l on l.id = lsm.lead_id
left join public.lead_scores ls on ls.lead_id = l.id
left join public.lead_enrichments le on le.lead_id = l.id
left join lateral (
  select
    coalesce(sum(case when type = 'open' then 1 else 0 end), 0)::int as opens,
    coalesce(sum(case when type = 'click' then 1 else 0 end), 0)::int as clicks,
    coalesce(count(*) filter (where event_type = 'reply'), 0)::int as replies,
    coalesce(count(*) filter (where event_type = 'reply' and meta->>'intent' = 'interested'), 0)::int as interested
  from (
    select 'open' as type, null::text as event_type, null::jsonb as meta
    from public.lead_email_events
    where lead_id = l.id and type = 'open'
    union all
    select 'click' as type, null::text as event_type, null::jsonb as meta
    from public.lead_email_events
    where lead_id = l.id and type = 'click'
    union all
    select null::text as type, event_type, meta
    from public.delivery_events
    where lead_id = l.id and event_type = 'reply'
    union all
    select null::text as type, event_type, meta
    from public.campaign_events
    where lead_id = l.id and event_type = 'reply'
  ) events
) eng on true
where s.is_active = true;

comment on view public.v_segment_preview is 'Preview view showing leads in segments with score, enrichment, and engagement data';

-- Grant access
grant select on public.v_segment_preview to authenticated, service_role;

-- ============================================================================
-- 7. Helper Function: Recompute All Segments (for account)
-- ============================================================================

create or replace function public.recompute_all_segments_v2(p_account_id uuid, p_limit_per int default 5000)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_total int := 0;
begin
  for r in
    select id
    from public.segments
    where account_id = p_account_id
      and is_active = true
  loop
    v_total := v_total + public.recompute_segment_v2(r.id, p_limit_per);
  end loop;
  
  return v_total;
end;
$$;

comment on function public.recompute_all_segments_v2(uuid, int) is 'Recompute all active segments for an account using v2 engine';

-- ============================================================================
-- 8. Migration Helper: Migrate existing segments.rule JSONB to segment_rules
-- ============================================================================

-- This function helps migrate existing segments that use JSONB rules
-- to the new segment_rules table structure
create or replace function public.migrate_segment_rules_to_v2()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_segment record;
  v_rule_count int := 0;
begin
  -- For each segment with a non-empty rule JSONB, create segment_rules entries
  for v_segment in
    select id, account_id, rule
    from public.segments
    where rule is not null
      and rule != '{}'::jsonb
      and not exists (
        select 1 from public.segment_rules sr where sr.segment_id = segments.id
      )
  loop
    -- Example migration logic (adjust based on your actual rule structure)
    -- This is a placeholder - you'll need to adapt based on your existing rule format
    
    -- If rule has score conditions
    if v_segment.rule ? 'min_score' then
      insert into public.segment_rules (
        segment_id, rule_type, rule_order, score_operator, score_value
      ) values (
        v_segment.id, 'score', 0, '>=', (v_segment.rule->>'min_score')::int
      );
      v_rule_count := v_rule_count + 1;
    end if;
    
    -- Add more migration logic for other rule types as needed
    -- This is just a starting point
    
  end loop;
  
  return v_rule_count;
end;
$$;

comment on function public.migrate_segment_rules_to_v2() is 'Helper function to migrate existing JSONB rules to segment_rules table';

