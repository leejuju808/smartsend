-- Block 22: Lead Scoring & Prioritization
-- This migration creates the advanced lead scoring system with intent, engagement, and smart queue prioritization

-- ============================================================================
-- 1. LEAD EVENTS Table (raw engagement data)
-- ============================================================================

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_type text not null check (event_type in ('open','click','reply','call','meeting','unsubscribe','bounce')),
  metadata jsonb default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_events_lead on public.lead_events(lead_id, occurred_at desc);
create index if not exists idx_lead_events_type on public.lead_events(org_id, event_type, occurred_at desc);
create index if not exists idx_lead_events_occurred on public.lead_events(occurred_at);

-- RLS for lead_events
alter table public.lead_events enable row level security;

create policy "Members can view events for their org"
  on public.lead_events
  for select
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = lead_events.org_id
      and org_members.user_id = auth.uid()
    )
  );

create policy "Service role can insert events"
  on public.lead_events
  for insert
  with check (true);

revoke insert on public.lead_events from authenticated;

-- ============================================================================
-- 2. LEAD SCORES Table (computed scores)
-- ============================================================================

create table if not exists public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  engagement_score numeric(5,2) default 0.0,
  intent_score numeric(5,2) default 0.0,
  priority numeric(5,2) default 0.0,
  last_computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, lead_id)
);

create index if not exists idx_lead_scores_org on public.lead_scores(org_id, priority desc);
create index if not exists idx_lead_scores_lead on public.lead_scores(lead_id);
create index if not exists idx_lead_scores_priority on public.lead_scores(priority desc);

-- RLS for lead_scores
alter table public.lead_scores enable row level security;

create policy "Members can view scores for their org"
  on public.lead_scores
  for select
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = lead_scores.org_id
      and org_members.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 3. LEAD SCORE WEIGHTS Table (configurable per org)
-- ============================================================================

create table if not exists public.lead_score_weights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  weight_engagement numeric(3,2) default 0.6,
  weight_intent numeric(3,2) default 0.4,
  engagement_decay_days int default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id)
);

create index if not exists idx_lead_score_weights_org on public.lead_score_weights(org_id);

-- Default weights for all orgs (can be overridden per org)
insert into public.lead_score_weights (org_id, weight_engagement, weight_intent, engagement_decay_days)
select id, 0.6, 0.4, 30 from public.orgs
on conflict (org_id) do nothing;

-- RLS for lead_score_weights
alter table public.lead_score_weights enable row level security;

create policy "Members can view weights for their org"
  on public.lead_score_weights
  for select
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = lead_score_weights.org_id
      and org_members.user_id = auth.uid()
    )
  );

create policy "Admins can update weights for their org"
  on public.lead_score_weights
  for update
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = lead_score_weights.org_id
      and org_members.user_id = auth.uid()
      and org_members.role in ('owner', 'admin')
    )
  );

-- ============================================================================
-- 4. VIEW: LEAD PRIORITY (join leads + scores)
-- ============================================================================

create or replace view public.view_lead_priority as
select
  l.id as lead_id,
  l.org_id,
  l.first_name,
  l.last_name,
  l.email,
  l.company,
  l.status,
  ls.engagement_score,
  ls.intent_score,
  ls.priority,
  ls.last_computed_at,
  l.created_at
from public.leads l
left join public.lead_scores ls on ls.lead_id = l.id;

grant select on public.view_lead_priority to authenticated, service_role;

comment on view public.view_lead_priority is 'Unified view of leads with their computed priority scores';

-- ============================================================================
-- 5. RPC: FN_RECOMPUTE_ENGAGEMENT
-- ============================================================================

create or replace function public.fn_recompute_engagement(p_lead_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_weight record;
  v_decay_days int;
  v_score numeric(5,2) := 0.0;
  v_total_weight numeric(5,2) := 0.0;
  v_now timestamptz := now();
begin
  -- Get org_id from lead
  select org_id into v_org_id from public.leads where id = p_lead_id;
  if v_org_id is null then
    return;
  end if;

  -- Get weights for org
  select * into v_weight from public.lead_score_weights where org_id = v_org_id;
  if v_weight is null then
    -- Use defaults
    v_decay_days := 30;
  else
    v_decay_days := v_weight.engagement_decay_days;
  end if;

  -- Compute engagement: weighted by recency with exponential decay
  -- Open = 1, Click = 5, Reply = 20, Call = 30, Meeting = 50
  with recent_events as (
    select
      event_type,
      occurred_at,
      -- Exponential decay: weight decreases over time
      exp(-1.0 * extract(epoch from (v_now - occurred_at)) / (v_decay_days * 86400)) as decay_factor
    from public.lead_events
    where lead_id = p_lead_id
    and occurred_at > v_now - make_interval(days => v_decay_days)
  ),
  weighted_events as (
    select
      case event_type
        when 'open' then 1.0
        when 'click' then 5.0
        when 'reply' then 20.0
        when 'call' then 30.0
        when 'meeting' then 50.0
        when 'unsubscribe' then -100.0
        when 'bounce' then -50.0
        else 0.0
      end * decay_factor as contribution
    from recent_events
  )
  select coalesce(sum(contribution), 0.0) into v_score
  from weighted_events;

  -- Clamp score to 0-100
  v_score := greatest(0, least(100, v_score));

  -- Upsert score
  insert into public.lead_scores (org_id, lead_id, engagement_score, last_computed_at)
  values (v_org_id, p_lead_id, v_score, v_now)
  on conflict (org_id, lead_id)
  do update set 
    engagement_score = v_score,
    last_computed_at = v_now,
    updated_at = v_now;
end;
$$;

grant execute on function public.fn_recompute_engagement(uuid) to service_role;

-- ============================================================================
-- 6. RPC: FN_UPDATE_PRIORITY
-- ============================================================================

create or replace function public.fn_update_priority(p_lead_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_weights record;
  v_engagement numeric(5,2);
  v_intent numeric(5,2);
  v_priority numeric(5,2);
begin
  -- Get org_id
  select org_id into v_org_id from public.leads where id = p_lead_id;

  -- Get weights for org
  select * into v_weights from public.lead_score_weights where org_id = v_org_id;
  if v_weights is null then
    -- Use defaults
    v_weights.weight_engagement := 0.6;
    v_weights.weight_intent := 0.4;
  end if;

  -- Get current scores
  select engagement_score, intent_score into v_engagement, v_intent
  from public.lead_scores
  where lead_id = p_lead_id;

  if v_engagement is null then
    v_engagement := 0.0;
  end if;
  if v_intent is null then
    v_intent := 0.0;
  end if;

  -- Compute weighted priority
  v_priority := (v_engagement * v_weights.weight_engagement) + (v_intent * v_weights.weight_intent);

  -- Clamp to 0-100
  v_priority := greatest(0, least(100, v_priority));

  -- Update
  update public.lead_scores
  set 
    priority = v_priority,
    updated_at = now()
  where lead_id = p_lead_id;
end;
$$;

grant execute on function public.fn_update_priority(uuid) to service_role;

-- ============================================================================
-- 7. RPC: FN_ENSURE_LEAD_SCORE
-- ============================================================================

create or replace function public.fn_ensure_lead_score(p_lead_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Ensure score exists, create if missing
  perform 1 from public.lead_scores where lead_id = p_lead_id;
  
  if not found then
    insert into public.lead_scores (org_id, lead_id)
    select org_id, id from public.leads where id = p_lead_id;
  end if;
end;
$$;

grant execute on function public.fn_ensure_lead_score(uuid) to service_role;

-- ============================================================================
-- 8. Trigger to auto-update scores when events are inserted
-- ============================================================================

create or replace function public.tg_recompute_scores_on_event()
returns trigger
language plpgsql
as $$
begin
  -- Ensure score exists
  perform public.fn_ensure_lead_score(new.lead_id);
  
  -- Recompute engagement
  perform public.fn_recompute_engagement(new.lead_id);
  
  -- Update priority
  perform public.fn_update_priority(new.lead_id);
  
  return new;
end;
$$;

create trigger trg_lead_events_recompute_scores
after insert on public.lead_events
for each row
execute function public.tg_recompute_scores_on_event();

-- ============================================================================
-- 9. Helper function to ensure all existing leads have scores
-- ============================================================================

create or replace function public.fn_backfill_lead_scores(p_org_id uuid)
returns int
language plpgsql
security definer
as $$
declare
  v_count int := 0;
begin
  -- Create scores for all leads that don't have them
  insert into public.lead_scores (org_id, lead_id)
  select p_org_id, id from public.leads
  where org_id = p_org_id
  and not exists (
    select 1 from public.lead_scores where lead_id = leads.id
  );
  
  get diagnostics v_count = row_count;
  
  -- Recompute all scores for this org
  perform public.fn_recompute_engagement(lead_id)
  from public.lead_scores
  where org_id = p_org_id;
  
  -- Update all priorities
  perform public.fn_update_priority(lead_id)
  from public.lead_scores
  where org_id = p_org_id;
  
  return v_count;
end;
$$;

grant execute on function public.fn_backfill_lead_scores(uuid) to authenticated, service_role;

comment on table public.lead_events is 'Raw engagement events for lead scoring';
comment on table public.lead_scores is 'Computed lead scores with engagement, intent, and priority';
comment on table public.lead_score_weights is 'Configurable scoring weights per organization';

