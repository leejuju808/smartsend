-- Block 455 — Sequence Optimizer v1
-- AI Analysis • Step Scoring • Variant Winner Selection • Drop-Off Diagnosis • Rewrite Suggestions
-- This block turns SmartSend from a tool that shows metrics → into a tool that interprets the metrics and tells the user exactly what to fix.

-- =====================================================
-- 1) Step Score Table
-- =====================================================

create table if not exists public.step_score (
  step_id uuid primary key references public.campaign_steps(id) on delete cascade,
  score int check (score >= 0 and score <= 100), -- 0–100
  open_score int check (open_score >= 0 and open_score <= 100),
  reply_score int check (reply_score >= 0 and reply_score <= 100),
  bounce_score int check (bounce_score >= 0 and bounce_score <= 100),
  spam_score int check (spam_score >= 0 and spam_score <= 100),
  variant_score int check (variant_score >= 0 and variant_score <= 100),
  dropoff_score int check (dropoff_score >= 0 and dropoff_score <= 100),
  last_updated timestamptz default now()
);

create index if not exists idx_step_score_step_id on public.step_score(step_id);
create index if not exists idx_step_score_score on public.step_score(score);
create index if not exists idx_step_score_last_updated on public.step_score(last_updated);

-- =====================================================
-- 2) Campaign Diagnosis Table
-- =====================================================

create table if not exists public.campaign_diagnosis (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  diagnosis_text text not null,
  suggestions jsonb not null default '[]'::jsonb, -- Array of suggestion objects
  generated_at timestamptz default now(),
  unique(campaign_id)
);

create index if not exists idx_campaign_diagnosis_campaign on public.campaign_diagnosis(campaign_id);
create index if not exists idx_campaign_diagnosis_workspace on public.campaign_diagnosis(workspace_id);
create index if not exists idx_campaign_diagnosis_generated_at on public.campaign_diagnosis(generated_at desc);

-- =====================================================
-- 3) Step Optimization Suggestions Table
-- =====================================================

create table if not exists public.step_optimization_suggestions (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.campaign_steps(id) on delete cascade,
  suggestion_type text not null check (suggestion_type in (
    'rewrite_template',
    'rewrite_subject',
    'remove_spam_flags',
    'suggest_delay_timing',
    'choose_best_variant',
    'switch_inbox',
    'switch_domain',
    'add_personalization',
    'change_hook',
    'drop_step'
  )),
  suggestion_text text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  metadata jsonb default '{}'::jsonb, -- Store additional context (e.g., variant_id, inbox_id, etc.)
  ai_rewrite_prompt text, -- Prompt for AI rewriter
  created_at timestamptz default now(),
  applied_at timestamptz,
  applied_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_step_optimization_step_id on public.step_optimization_suggestions(step_id);
create index if not exists idx_step_optimization_type on public.step_optimization_suggestions(suggestion_type);
create index if not exists idx_step_optimization_priority on public.step_optimization_suggestions(priority);
create index if not exists idx_step_optimization_applied on public.step_optimization_suggestions(step_id) where applied_at is null;

-- =====================================================
-- 4) Helper Function: Calculate Step Score
-- =====================================================

create or replace function public.calculate_step_score(
  p_step_id uuid
)
returns table (
  score int,
  open_score int,
  reply_score int,
  bounce_score int,
  spam_score int,
  variant_score int,
  dropoff_score int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stats record;
  v_open_score int;
  v_reply_score int;
  v_bounce_score int;
  v_spam_score int;
  v_variant_score int;
  v_dropoff_score int;
  v_final_score int;
  v_open_rate numeric;
  v_reply_rate numeric;
  v_bounce_rate numeric;
  v_spam_rate numeric;
  v_variant_health record;
  v_dropoff_rate numeric;
  v_prev_step_sent int;
  v_step_no int;
  v_campaign_id uuid;
  v_current_step_no int;
  v_current_campaign_id uuid;
begin
  -- Get step stats
  select * into v_stats
  from public.get_step_stats(p_step_id);
  
  if v_stats is null or v_stats.sent = 0 then
    -- No data yet, return default scores
    return query select 50, 50, 50, 100, 100, 50, 50;
    return;
  end if;
  
  -- Calculate rates
  v_open_rate := v_stats.open_rate;
  v_reply_rate := v_stats.reply_rate;
  v_bounce_rate := v_stats.bounce_rate;
  v_spam_rate := v_stats.spam_rate;
  
  -- Score open rate (benchmark: 30% = 70/100, 20% = 50/100, 10% = 30/100)
  if v_open_rate >= 30 then
    v_open_score := 70 + least(30, (v_open_rate - 30) * 2);
  elsif v_open_rate >= 20 then
    v_open_score := 50 + (v_open_rate - 20) * 2;
  elsif v_open_rate >= 10 then
    v_open_score := 30 + (v_open_rate - 10) * 2;
  else
    v_open_score := greatest(0, v_open_rate * 3);
  end if;
  v_open_score := least(100, greatest(0, v_open_score));
  
  -- Score reply rate (benchmark: 2% = 80/100, 1% = 60/100, 0.5% = 40/100)
  if v_reply_rate >= 2 then
    v_reply_score := 80 + least(20, (v_reply_rate - 2) * 10);
  elsif v_reply_rate >= 1 then
    v_reply_score := 60 + (v_reply_rate - 1) * 20;
  elsif v_reply_rate >= 0.5 then
    v_reply_score := 40 + (v_reply_rate - 0.5) * 40;
  else
    v_reply_score := greatest(0, v_reply_rate * 80);
  end if;
  v_reply_score := least(100, greatest(0, v_reply_score));
  
  -- Score bounce rate (lower is better: 0% = 100, 2% = 90, 4% = 70, 6% = 50, 8% = 30)
  if v_bounce_rate <= 0.02 then
    v_bounce_score := 100 - (v_bounce_rate * 500);
  elsif v_bounce_rate <= 0.04 then
    v_bounce_score := 90 - ((v_bounce_rate - 0.02) * 1000);
  elsif v_bounce_rate <= 0.06 then
    v_bounce_score := 70 - ((v_bounce_rate - 0.04) * 1000);
  elsif v_bounce_rate <= 0.08 then
    v_bounce_score := 50 - ((v_bounce_rate - 0.06) * 1000);
  else
    v_bounce_score := greatest(0, 30 - ((v_bounce_rate - 0.08) * 500));
  end if;
  v_bounce_score := least(100, greatest(0, v_bounce_score));
  
  -- Score spam rate (lower is better: 0% = 100, 0.1% = 90, 0.2% = 70, 0.3% = 50)
  if v_spam_rate <= 0.001 then
    v_spam_score := 100 - (v_spam_rate * 10000);
  elsif v_spam_rate <= 0.002 then
    v_spam_score := 90 - ((v_spam_rate - 0.001) * 20000);
  elsif v_spam_rate <= 0.003 then
    v_spam_score := 70 - ((v_spam_rate - 0.002) * 20000);
  else
    v_spam_score := greatest(0, 50 - ((v_spam_rate - 0.003) * 10000));
  end if;
  v_spam_score := least(100, greatest(0, v_spam_score));
  
  -- Calculate variant health (compare variants)
  -- Note: campaign_step_variants uses campaign_id + step_no, not step_id
  select cs.step_no, cs.campaign_id into v_step_no, v_campaign_id
  from public.campaign_steps cs
  where cs.id = p_step_id;
  
  if v_step_no is not null and v_campaign_id is not null then
    select 
      count(*)::int as variant_count,
      max(case when vs.sent >= 10 then (vs.opened::numeric / nullif(vs.sent, 0)) * 100 else 0 end)::numeric as best_open_rate,
      min(case when vs.sent >= 10 then (vs.opened::numeric / nullif(vs.sent, 0)) * 100 else 100 end)::numeric as worst_open_rate
    into v_variant_health
    from public.campaign_step_variants v
    left join public.campaign_step_variant_stats vs on vs.variant_id = v.id
    where v.campaign_id = v_campaign_id 
      and v.step_no = v_step_no 
      and coalesce(v.enabled, true) = true;
  else
    -- No variants found, set default
    v_variant_health.variant_count := 0;
    v_variant_health.best_open_rate := 0;
    v_variant_health.worst_open_rate := 100;
  end if;
  
  if v_variant_health.variant_count > 1 and v_variant_health.best_open_rate > 0 then
    -- If best variant beats worst by >15%, score is high
    if (v_variant_health.best_open_rate - coalesce(v_variant_health.worst_open_rate, 0)) > 15 then
      v_variant_score := 80;
    elsif (v_variant_health.best_open_rate - coalesce(v_variant_health.worst_open_rate, 0)) > 10 then
      v_variant_score := 60;
    else
      v_variant_score := 50;
    end if;
  else
    v_variant_score := 50; -- No variants or not enough data
  end if;
  
  -- Calculate drop-off score (compare with previous step)
  select cs.step_no, cs.campaign_id into v_current_step_no, v_current_campaign_id
  from public.campaign_steps cs
  where cs.id = p_step_id;
  
  if v_current_step_no > 1 and v_current_campaign_id is not null then
    -- Get previous step stats
    select sent into v_prev_step_sent
    from public.campaign_step_stats css
    join public.campaign_steps cs on cs.id = css.step_id
    where cs.campaign_id = v_current_campaign_id
      and cs.step_no = v_current_step_no - 1;
    
    if v_prev_step_sent > 0 then
      v_dropoff_rate := 100.0 * (1.0 - (v_stats.sent::numeric / v_prev_step_sent::numeric));
      
      -- Score drop-off (lower is better: <20% = 80, <30% = 60, <40% = 40, >=40% = 20)
      if v_dropoff_rate < 20 then
        v_dropoff_score := 80 + least(20, (20 - v_dropoff_rate) * 1);
      elsif v_dropoff_rate < 30 then
        v_dropoff_score := 60 + ((30 - v_dropoff_rate) * 2);
      elsif v_dropoff_rate < 40 then
        v_dropoff_score := 40 + ((40 - v_dropoff_rate) * 2);
      else
        v_dropoff_score := greatest(0, 20 - ((v_dropoff_rate - 40) * 0.5));
      end if;
      v_dropoff_score := least(100, greatest(0, v_dropoff_score));
    else
      v_dropoff_score := 50; -- No previous step data
    end if;
  else
    v_dropoff_score := 100; -- First step, no drop-off
  end if;
  
  -- Calculate weighted composite score
  -- Component weights: Open 30%, Reply 25%, Bounce 20%, Spam 10%, Variant 10%, Dropoff 5%
  v_final_score := round(
    (v_open_score * 0.30) +
    (v_reply_score * 0.25) +
    (v_bounce_score * 0.20) +
    (v_spam_score * 0.10) +
    (v_variant_score * 0.10) +
    (v_dropoff_score * 0.05)
  );
  
  v_final_score := least(100, greatest(0, v_final_score));
  
  return query select 
    v_final_score,
    v_open_score,
    v_reply_score,
    v_bounce_score,
    v_spam_score,
    v_variant_score,
    v_dropoff_score;
end;
$$;

-- =====================================================
-- 5) Function: Update Step Score
-- =====================================================

create or replace function public.update_step_score(
  p_step_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scores record;
begin
  select * into v_scores from public.calculate_step_score(p_step_id);
  
  insert into public.step_score (
    step_id,
    score,
    open_score,
    reply_score,
    bounce_score,
    spam_score,
    variant_score,
    dropoff_score,
    last_updated
  )
  values (
    p_step_id,
    v_scores.score,
    v_scores.open_score,
    v_scores.reply_score,
    v_scores.bounce_score,
    v_scores.spam_score,
    v_scores.variant_score,
    v_scores.dropoff_score,
    now()
  )
  on conflict (step_id) do update set
    score = excluded.score,
    open_score = excluded.open_score,
    reply_score = excluded.reply_score,
    bounce_score = excluded.bounce_score,
    spam_score = excluded.spam_score,
    variant_score = excluded.variant_score,
    dropoff_score = excluded.dropoff_score,
    last_updated = excluded.last_updated;
end;
$$;

-- =====================================================
-- 6) Enable RLS
-- =====================================================

alter table public.step_score enable row level security;
alter table public.campaign_diagnosis enable row level security;
alter table public.step_optimization_suggestions enable row level security;

-- RLS policies for step_score
create policy "step_score_select_workspace" on public.step_score
  for select
  using (
    exists (
      select 1 from public.campaign_steps cs
      join public.campaigns c on c.id = cs.campaign_id
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where cs.id = step_score.step_id
        and wm.user_id = auth.uid()
    )
  );

-- RLS policies for campaign_diagnosis
create policy "campaign_diagnosis_select_workspace" on public.campaign_diagnosis
  for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = campaign_diagnosis.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- RLS policies for step_optimization_suggestions
create policy "step_optimization_suggestions_select_workspace" on public.step_optimization_suggestions
  for select
  using (
    exists (
      select 1 from public.campaign_steps cs
      join public.campaigns c on c.id = cs.campaign_id
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where cs.id = step_optimization_suggestions.step_id
        and wm.user_id = auth.uid()
    )
  );

create policy "step_optimization_suggestions_update_workspace" on public.step_optimization_suggestions
  for update
  using (
    exists (
      select 1 from public.campaign_steps cs
      join public.campaigns c on c.id = cs.campaign_id
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where cs.id = step_optimization_suggestions.step_id
        and wm.user_id = auth.uid()
    )
  );

