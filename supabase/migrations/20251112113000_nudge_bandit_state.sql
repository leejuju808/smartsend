set search_path = public, pg_temp;

-- A) Variant catalog index for scenario lookups
create index if not exists idx_nudge_variants_camp_scen on public.nudge_variants(campaign_id, scenario) where is_active;

-- Drop legacy views/tables that conflict with the new bandit schema
drop view if exists public.v_nudge_variant_stats;
drop view if exists public.v_nudge_campaign_stats;
drop table if exists public.nudge_outcomes cascade;

-- B) Outcome taps (one row per outbound message we evaluate)
create table if not exists public.nudge_outcomes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message_id uuid not null references public.send_queue(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  scenario text not null,
  variant_id uuid not null references public.nudge_variants(id) on delete cascade,
  opened boolean,
  clicked boolean,
  replied boolean,
  reply_label text,
  booked boolean,
  reward numeric(6,3) not null default 0.0,
  meta jsonb not null default '{}'::jsonb
);

create unique index if not exists idx_nudge_outcomes_message on public.nudge_outcomes(message_id);
create index if not exists idx_nudge_outcomes_camp_scen on public.nudge_outcomes(campaign_id, scenario);
create index if not exists idx_nudge_outcomes_variant on public.nudge_outcomes(variant_id);

-- C) Bandit state per variant (Bayesian Beta for "success = replied OR booked")
create table if not exists public.nudge_bandit_state (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  scenario text not null,
  variant_id uuid not null references public.nudge_variants(id) on delete cascade,
  alpha real not null default 1.0,
  beta real not null default 1.0,
  success_weight real not null default 1.0,
  failure_weight real not null default 1.0,
  last_update timestamptz not null default now(),
  unique (campaign_id, scenario, variant_id)
);

create index if not exists idx_bandit_camp_scen on public.nudge_bandit_state(campaign_id, scenario);

-- D) Decayed counters view for analytics
create or replace view public.v_nudge_variant_stats as
select
  v.campaign_id,
  v.scenario,
  v.id as variant_id,
  v.name,
  v.is_active,
  count(o.*) as samples,
  sum(case when coalesce(o.replied, false) or coalesce(o.booked, false) then 1 else 0 end) as successes,
  avg(o.reward) as avg_reward,
  coalesce(bs.alpha, 1.0) / nullif(coalesce(bs.alpha, 1.0) + coalesce(bs.beta, 1.0), 0) as posterior_mean
from public.nudge_variants v
left join public.nudge_outcomes o on o.variant_id = v.id
left join public.nudge_bandit_state bs on bs.variant_id = v.id and bs.campaign_id = v.campaign_id and bs.scenario = v.scenario
group by v.campaign_id, v.scenario, v.id, v.name, v.is_active, coalesce(bs.alpha, 1.0), coalesce(bs.beta, 1.0);

create or replace view public.v_nudge_campaign_stats as
select
  campaign_id,
  scenario,
  sum(samples) filter (where is_active) as samples,
  sum(successes) filter (where is_active) as successes,
  avg(avg_reward) filter (where is_active) as avg_reward,
  avg(posterior_mean) filter (where is_active) as avg_posterior
from public.v_nudge_variant_stats
group by campaign_id, scenario;

-- 2) RPCs — reward function & bandit helpers
create or replace function public.compute_nudge_reward(
  p_opened boolean,
  p_clicked boolean,
  p_replied boolean,
  p_booked boolean,
  p_label text
) returns numeric
language sql
immutable
as $$
  select
    (case when coalesce(p_booked, false) then 1.0 else 0 end) * 1.0 +
    (case when coalesce(p_replied, false) then 1.0 else 0 end) * 0.8 +
    (case when coalesce(p_clicked, false) then 1.0 else 0 end) * 0.2 +
    (case when coalesce(p_opened, false) then 1.0 else 0 end) * 0.1 +
    (case when p_label in ('positive','question') then 0.1 else 0 end);
$$;

drop function if exists public.nudge_pick_variant(uuid, text, text);
drop function if exists public.nudge_record_outcome(uuid, uuid, text, uuid, boolean, boolean, boolean, text, boolean);

do $$
begin
  if not exists (
    select 1
    from pg_proc
    where proname = 'nudge_record_outcome'
      and pg_catalog.pg_function_is_visible(oid)
      and pg_get_function_identity_arguments(oid) = 'uuid, uuid, text, uuid, boolean, boolean, boolean, text, boolean, jsonb'
  ) then
    -- no-op, function will be created below
    null;
  end if;
end;
$$;

create or replace function public.nudge_record_outcome(
  p_message uuid,
  p_campaign uuid,
  p_scenario text,
  p_variant uuid,
  p_opened boolean default null,
  p_clicked boolean default null,
  p_replied boolean default null,
  p_reply_label text default null,
  p_booked boolean default null,
  p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
as $$
declare
  decay constant real := 0.98;
  v_existing record;
  v_opened boolean;
  v_clicked boolean;
  v_replied boolean;
  v_booked boolean;
  v_label text;
  v_reward numeric(6,3);
  was_success boolean := false;
  is_success boolean := false;
  success_delta real := 0;
  failure_delta real := 0;
begin
  if p_message is null then
    raise exception 'nudge_record_outcome requires message id';
  end if;
  if p_campaign is null or p_variant is null then
    raise exception 'nudge_record_outcome requires campaign and variant';
  end if;
  if p_scenario is null then
    raise exception 'nudge_record_outcome requires scenario';
  end if;

  select *
  into v_existing
  from public.nudge_outcomes
  where message_id = p_message
  for update;

  if found then
    v_opened := coalesce(v_existing.opened, false) or coalesce(p_opened, false);
    v_clicked := coalesce(v_existing.clicked, false) or coalesce(p_clicked, false);
    v_replied := coalesce(v_existing.replied, false) or coalesce(p_replied, false);
    v_booked := coalesce(v_existing.booked, false) or coalesce(p_booked, false);
    v_label := coalesce(p_reply_label, v_existing.reply_label);
    was_success := coalesce(v_existing.replied, false) or coalesce(v_existing.booked, false);
  else
    v_opened := coalesce(p_opened, false);
    v_clicked := coalesce(p_clicked, false);
    v_replied := coalesce(p_replied, false);
    v_booked := coalesce(p_booked, false);
    v_label := p_reply_label;
  end if;

  is_success := coalesce(v_replied, false) or coalesce(v_booked, false);
  v_reward := public.compute_nudge_reward(v_opened, v_clicked, v_replied, v_booked, v_label);

  if found then
    update public.nudge_outcomes
    set
      campaign_id = p_campaign,
      scenario = p_scenario,
      variant_id = p_variant,
      opened = v_opened,
      clicked = v_clicked,
      replied = v_replied,
      reply_label = v_label,
      booked = v_booked,
      reward = v_reward,
      meta = coalesce(public.nudge_outcomes.meta, '{}'::jsonb) || coalesce(p_meta, '{}'::jsonb)
    where id = v_existing.id;

    if (not was_success) and is_success then
      success_delta := 1;
    end if;
  else
    insert into public.nudge_outcomes(
      message_id,
      campaign_id,
      scenario,
      variant_id,
      opened,
      clicked,
      replied,
      reply_label,
      booked,
      reward,
      meta
    ) values (
      p_message,
      p_campaign,
      p_scenario,
      p_variant,
      v_opened,
      v_clicked,
      v_replied,
      v_label,
      v_booked,
      v_reward,
      coalesce(p_meta, '{}'::jsonb)
    )
    on conflict (message_id) do update
      set
        campaign_id = excluded.campaign_id,
        scenario = excluded.scenario,
        variant_id = excluded.variant_id,
        opened = excluded.opened,
        clicked = excluded.clicked,
        replied = excluded.replied,
        reply_label = excluded.reply_label,
        booked = excluded.booked,
        reward = excluded.reward,
        meta = coalesce(public.nudge_outcomes.meta, '{}'::jsonb) || coalesce(excluded.meta, '{}'::jsonb);

    if not is_success then
      failure_delta := 1;
    else
      success_delta := 1;
    end if;
  end if;

  insert into public.nudge_bandit_state(
    campaign_id,
    scenario,
    variant_id,
    alpha,
    beta
  ) values (
    p_campaign,
    p_scenario,
    p_variant,
    1.0 + success_delta,
    1.0 + failure_delta
  )
  on conflict (campaign_id, scenario, variant_id) do update
    set
      alpha = (public.nudge_bandit_state.alpha * decay) + (case when success_delta > 0 then success_delta * public.nudge_bandit_state.success_weight else 0 end),
      beta = (public.nudge_bandit_state.beta * decay) + (case when failure_delta > 0 then failure_delta * public.nudge_bandit_state.failure_weight else 0 end),
      last_update = now();
end;
$$;

create or replace function public.nudge_pick_variant(
  p_campaign uuid,
  p_scenario text,
  p_epsilon real default 0.10
) returns uuid
language plpgsql
stable
as $$
declare
  v_candidate record;
  best_id uuid;
  best_draw real := -1;
  draw real;
  explore real;
  epsilon real;
  any_active boolean;
begin
  epsilon := greatest(0, least(1, coalesce(p_epsilon, 0.10)));

  insert into public.nudge_bandit_state(campaign_id, scenario, variant_id)
  select v.campaign_id, v.scenario, v.id
  from public.nudge_variants v
  where v.campaign_id = p_campaign
    and v.scenario = p_scenario
    and v.is_active
  on conflict do nothing;

  select exists (
    select 1
    from public.nudge_variants
    where campaign_id = p_campaign
      and scenario = p_scenario
      and is_active
  ) into any_active;

  if not any_active then
    return null;
  end if;

  explore := random();
  if explore < epsilon then
    select id
    into best_id
    from public.nudge_variants
    where campaign_id = p_campaign
      and scenario = p_scenario
      and is_active
    order by random()
    limit 1;

    return best_id;
  end if;

  for v_candidate in
    select s.variant_id, s.alpha, s.beta
    from public.nudge_bandit_state s
    join public.nudge_variants nv on nv.id = s.variant_id and nv.is_active
    where s.campaign_id = p_campaign
      and s.scenario = p_scenario
  loop
    draw := (coalesce(v_candidate.alpha, 1) + random()) / nullif(coalesce(v_candidate.alpha, 1) + coalesce(v_candidate.beta, 1) + 1, 0);

    if draw > best_draw then
      best_draw := draw;
      best_id := v_candidate.variant_id;
    end if;
  end loop;

  return best_id;
end;
$$;

create or replace function public.nudge_pick_variant(
  p_campaign uuid,
  p_scenario text,
  p_unused text
) returns uuid
language sql
stable
as $$
  select public.nudge_pick_variant(p_campaign, p_scenario, 0.10);
$$;

drop function if exists public.enqueue_followup_job(uuid, uuid, uuid, uuid, timestamptz, int, jsonb);

create or replace function public.enqueue_followup_job(
  p_campaign uuid,
  p_thread uuid,
  p_lead uuid,
  p_variant uuid,
  p_scenario text,
  p_not_before timestamptz,
  p_priority int default 0,
  p_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_payload jsonb := coalesce(p_details, '{}'::jsonb);
  v_scenario text := coalesce(nullif(trim(p_scenario), ''), 'no_reply');
  v_tone text;
begin
  v_payload := jsonb_set(v_payload, '{scenario}', to_jsonb(v_scenario), true);

  if p_variant is not null then
    v_payload := jsonb_set(v_payload, '{variant_id}', to_jsonb(p_variant), true);
  end if;

  insert into public.send_queue (
    campaign_id,
    thread_id,
    lead_id,
    variant_id,
    status,
    not_before,
    priority,
    source,
    payload
  ) values (
    p_campaign,
    p_thread,
    p_lead,
    p_variant,
    'pending',
    p_not_before,
    coalesce(p_priority, 0),
    'followup_orchestrator',
    v_payload
  )
  returning id into v_id;

  if p_variant is not null then
    select tone into v_tone
    from public.nudge_variants
    where id = p_variant;

    insert into public.nudge_assignments (
      thread_id,
      campaign_id,
      lead_id,
      send_queue_id,
      variant_id,
      scenario,
      tone
    ) values (
      p_thread,
      p_campaign,
      p_lead,
      v_id,
      p_variant,
      v_scenario,
      coalesce(v_tone, 'auto')
    )
    on conflict do nothing;
  end if;

  return v_id;
end;
$$;

grant execute on function public.nudge_record_outcome(uuid, uuid, text, uuid, boolean, boolean, boolean, text, boolean, jsonb) to service_role;
grant execute on function public.nudge_record_outcome(uuid, uuid, text, uuid, boolean, boolean, boolean, text, boolean, jsonb) to authenticated;

grant execute on function public.nudge_pick_variant(uuid, text, real) to service_role, authenticated;
grant execute on function public.nudge_pick_variant(uuid, text, text) to service_role, authenticated;
grant execute on function public.enqueue_followup_job(uuid, uuid, uuid, uuid, text, timestamptz, int, jsonb) to service_role;

grant execute on function public.compute_nudge_reward(boolean, boolean, boolean, boolean, text) to public;
