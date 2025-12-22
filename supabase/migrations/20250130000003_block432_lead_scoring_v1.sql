-- Block 432 — Lead Scoring v1
-- (0–100 Score • Positive & Negative Factors • Auto-Scoring • Campaign Smart Targeting)

-- ============================================================================
-- 1. Lead Scores Table
-- ============================================================================

create table if not exists public.lead_scores (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  score int default 0 check (score >= 0 and score <= 100),
  computed_at timestamptz default now(),

  -- components for debug
  positive jsonb default '{}'::jsonb,
  negative jsonb default '{}'::jsonb
);

-- Index for score-based queries
create index if not exists idx_lead_scores_score
on public.lead_scores(score);

create index if not exists idx_lead_scores_computed_at
on public.lead_scores(computed_at desc);

-- RLS
alter table public.lead_scores enable row level security;

-- Policy: users can view scores for leads they own
create policy lead_scores_select on public.lead_scores
  for select
  using (
    exists (
      select 1
      from public.leads l
      where l.id = lead_scores.lead_id
        and (
          l.account_id = auth.uid()
          or l.user_id = auth.uid()
          or exists (
            select 1 from public.organizations o
            join public.organization_members om on om.org_id = o.id
            where o.id = l.org_id and om.user_id = auth.uid()
          )
        )
    )
  );

-- Service role can do everything
create policy lead_scores_service on public.lead_scores
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.lead_scores is 'Lead quality scores (0-100) computed from enrichment, engagement, and quality flags';

-- ============================================================================
-- 2. Helper Function: Get Lead Engagement Data
-- ============================================================================

create or replace function public.get_lead_engagement(p_lead_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'opens', coalesce(sum(case when type = 'open' then 1 else 0 end), 0),
    'clicks', coalesce(sum(case when type = 'click' then 1 else 0 end), 0),
    'replies', coalesce(count(*) filter (where event_type = 'reply'), 0),
    'bounces', coalesce(count(*) filter (where event_type = 'bounce'), 0),
    'spam', coalesce(count(*) filter (where event_type = 'spam'), 0),
    'interested', coalesce(count(*) filter (where event_type = 'reply' and meta->>'intent' = 'interested'), 0)
  ) into v_result
  from (
    -- Opens and clicks from lead_email_events
    select 'open' as type, null::text as event_type, null::jsonb as meta
    from public.lead_email_events
    where lead_id = p_lead_id and type = 'open'
    union all
    select 'click' as type, null::text as event_type, null::jsonb as meta
    from public.lead_email_events
    where lead_id = p_lead_id and type = 'click'
    union all
    -- Replies, bounces, spam from delivery_events or campaign_events
    select null::text as type, event_type, meta
    from public.delivery_events
    where lead_id = p_lead_id and event_type in ('reply', 'bounce', 'spam')
    union all
    select null::text as type, event_type, meta
    from public.campaign_events
    where lead_id = p_lead_id and event_type in ('reply', 'bounce', 'spam')
  ) events;

  return coalesce(v_result, '{"opens":0,"clicks":0,"replies":0,"bounces":0,"spam":0,"interested":0}'::jsonb);
end;
$$;

-- ============================================================================
-- 3. Scoring Function: Compute Lead Score
-- ============================================================================

create or replace function public.compute_lead_score(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_enrichment record;
  v_engagement jsonb;
  v_score int := 0;
  v_positive jsonb := '{}'::jsonb;
  v_negative jsonb := '{}'::jsonb;
  v_domain text;
  v_free_domains text[] := array['gmail.com', 'yahoo.com', 'hotmail.com', 'aol.com', 'outlook.com', 'icloud.com'];
  v_employee_count int;
begin
  -- Get lead data
  select l.*, le.*
  into v_lead
  from public.leads l
  left join public.lead_enrichments le on le.lead_id = l.id
  where l.id = p_lead_id;

  if not found then
    return jsonb_build_object('error', 'Lead not found');
  end if;

  -- Get engagement data
  v_engagement := public.get_lead_engagement(p_lead_id);

  -- Extract domain
  v_domain := coalesce(
    v_lead.domain,
    v_lead.company_domain,
    split_part(v_lead.email, '@', 2)
  );

  -- Extract employee count
  v_employee_count := coalesce(
    v_lead.company_employee_count,
    case
      when v_lead.company_size ~ '^\d+-\d+$' then
        (regexp_split_to_array(v_lead.company_size, '-'))[1]::int
      else null
    end
  );

  -- POSITIVE FACTORS

  -- Title exists: +5
  if v_lead.title is not null and length(trim(v_lead.title)) > 0 then
    v_positive := v_positive || jsonb_build_object('title', 5);
    v_score := v_score + 5;
  end if;

  -- Seniority exists: +5
  if v_lead.seniority is not null and length(trim(v_lead.seniority)) > 0 then
    v_positive := v_positive || jsonb_build_object('seniority', 5);
    v_score := v_score + 5;
  end if;

  -- Has LinkedIn: +10
  if v_lead.linkedin_url is not null and length(trim(v_lead.linkedin_url)) > 0 then
    v_positive := v_positive || jsonb_build_object('linkedin', 10);
    v_score := v_score + 10;
  end if;

  -- Company size 10–500: +10
  if v_employee_count is not null and v_employee_count >= 10 and v_employee_count <= 500 then
    v_positive := v_positive || jsonb_build_object('size', 10);
    v_score := v_score + 10;
  end if;

  -- Industry matches "ideal" SMB B2B: +10
  -- (Assuming common B2B industries)
  if v_lead.industry is not null then
    v_positive := v_positive || jsonb_build_object('industry', 10);
    v_score := v_score + 10;
  end if;

  -- Tech stack known: +5
  if v_lead.tech_tags is not null and array_length(v_lead.tech_tags, 1) > 0 then
    v_positive := v_positive || jsonb_build_object('tech', 5);
    v_score := v_score + 5;
  end if;

  -- City/State/Timezone exists: +5
  if v_lead.location is not null and length(trim(v_lead.location)) > 0 then
    v_positive := v_positive || jsonb_build_object('location', 5);
    v_score := v_score + 5;
  end if;

  -- Enriched successfully: +10
  if v_lead.lead_id is not null then
    v_positive := v_positive || jsonb_build_object('enriched', 10);
    v_score := v_score + 10;
  end if;

  -- Opened an email: +10
  if (v_engagement->>'opens')::int > 0 then
    v_positive := v_positive || jsonb_build_object('open', 10);
    v_score := v_score + 10;
  end if;

  -- Clicked an email: +15
  if (v_engagement->>'clicks')::int > 0 then
    v_positive := v_positive || jsonb_build_object('click', 15);
    v_score := v_score + 15;
  end if;

  -- Replied: +20
  if (v_engagement->>'replies')::int > 0 then
    v_positive := v_positive || jsonb_build_object('reply', 20);
    v_score := v_score + 20;
  end if;

  -- Interested reply: +30
  if (v_engagement->>'interested')::int > 0 then
    v_positive := v_positive || jsonb_build_object('interested', 30);
    v_score := v_score + 30;
  end if;

  -- NEGATIVE FACTORS

  -- Bounce: -100
  if (v_engagement->>'bounces')::int > 0 then
    v_negative := v_negative || jsonb_build_object('bounce', -100);
    v_score := v_score - 100;
  end if;

  -- Spam complaint: -150
  if (v_engagement->>'spam')::int > 0 then
    v_negative := v_negative || jsonb_build_object('spam', -150);
    v_score := v_score - 150;
  end if;

  -- Free email domain: -20
  if v_domain is not null and lower(v_domain) = any(v_free_domains) then
    v_negative := v_negative || jsonb_build_object('free_email', -20);
    v_score := v_score - 20;
  end if;

  -- No enrichment: -10
  if v_lead.lead_id is null then
    v_negative := v_negative || jsonb_build_object('no_enrichment', -10);
    v_score := v_score - 10;
  end if;

  -- No title: -5
  if v_lead.title is null or length(trim(v_lead.title)) = 0 then
    v_negative := v_negative || jsonb_build_object('no_title', -5);
    v_score := v_score - 5;
  end if;

  -- No company: -10
  if (v_lead.company_name is null or length(trim(v_lead.company_name)) = 0)
     and (v_lead.company is null or length(trim(v_lead.company)) = 0) then
    v_negative := v_negative || jsonb_build_object('no_company', -10);
    v_score := v_score - 10;
  end if;

  -- Large enterprise (5,000+): -10
  if v_employee_count is not null and v_employee_count >= 5000 then
    v_negative := v_negative || jsonb_build_object('large_enterprise', -10);
    v_score := v_score - 10;
  end if;

  -- Very small (1–2 employees): -10
  if v_employee_count is not null and v_employee_count >= 1 and v_employee_count <= 2 then
    v_negative := v_negative || jsonb_build_object('very_small', -10);
    v_score := v_score - 10;
  end if;

  -- Clamp score to 0-100
  v_score := greatest(0, least(100, v_score));

  -- Upsert score
  insert into public.lead_scores (lead_id, score, computed_at, positive, negative)
  values (p_lead_id, v_score, now(), v_positive, v_negative)
  on conflict (lead_id) do update
    set score = excluded.score,
        computed_at = excluded.computed_at,
        positive = excluded.positive,
        negative = excluded.negative;

  return jsonb_build_object(
    'score', v_score,
    'positive', v_positive,
    'negative', v_negative
  );
end;
$$;

comment on function public.compute_lead_score(uuid) is 'Compute lead score (0-100) based on enrichment, engagement, and quality factors';

-- ============================================================================
-- 4. Trigger Function: Auto-score on enrichment update
-- ============================================================================

create or replace function public.trg_score_on_enrichment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.compute_lead_score(new.lead_id);
  return new;
end;
$$;

drop trigger if exists score_on_enrichment_insert on public.lead_enrichments;
create trigger score_on_enrichment_insert
after insert or update on public.lead_enrichments
for each row execute function public.trg_score_on_enrichment();

-- ============================================================================
-- 5. Trigger Function: Auto-score on engagement events
-- ============================================================================

create or replace function public.trg_score_on_engagement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_id is not null then
    perform public.compute_lead_score(new.lead_id);
  end if;
  return new;
end;
$$;

-- Trigger on lead_email_events
drop trigger if exists score_on_email_event on public.lead_email_events;
create trigger score_on_email_event
after insert on public.lead_email_events
for each row execute function public.trg_score_on_engagement();

-- Trigger on delivery_events
drop trigger if exists score_on_delivery_event on public.delivery_events;
create trigger score_on_delivery_event
after insert on public.delivery_events
for each row
when (new.event_type in ('reply', 'bounce', 'spam'))
execute function public.trg_score_on_engagement();

-- Trigger on campaign_events
drop trigger if exists score_on_campaign_event on public.campaign_events;
create trigger score_on_campaign_event
after insert on public.campaign_events
for each row
when (new.event_type in ('reply', 'bounce', 'spam'))
execute function public.trg_score_on_engagement();

-- ============================================================================
-- 6. Batch Recompute Function
-- ============================================================================

create or replace function public.recompute_all_lead_scores(p_limit int default 1000)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_lead record;
begin
  for v_lead in
    select id
    from public.leads
    order by created_at desc
    limit p_limit
  loop
    perform public.compute_lead_score(v_lead.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.recompute_all_lead_scores(int) is 'Recompute scores for up to p_limit leads (for daily cron)';



