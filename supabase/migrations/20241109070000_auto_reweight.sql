-- 1) Extend followup_rules with auto reweight configuration knobs
alter table public.followup_rules
  add column if not exists auto_reweight_enabled boolean not null default false,
  add column if not exists reweight_min_sends int not null default 25,
  add column if not exists reweight_metric text not null default 'reply',
  add column if not exists reweight_floor real not null default 0.5,
  add column if not exists reweight_ceiling real not null default 3.0,
  add column if not exists reweight_smoothing real not null default 5.0;

-- 2) Create audit table for weight changes
create table if not exists public.variant_weight_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  scenario text not null,
  tone text not null,
  variant_id uuid not null references public.nudge_variants(id) on delete cascade,
  old_weight real not null,
  new_weight real not null,
  basis text not null,
  window_start date not null,
  window_end date not null,
  stats jsonb not null
);

create index if not exists idx_variant_weight_audit_campaign on public.variant_weight_audit(campaign_id, created_at desc);

-- 3) Variant performance view (30 day window)
create or replace view public.v_variant_perf_30d as
select
  v.campaign_id,
  v.id as variant_id,
  v.scenario,
  v.tone,
  v.name,
  v.weight,
  count(na.*) filter (where q.created_at >= now() - interval '30 days') as sends_30d,
  count(nm.*) filter (
    where nm.direction = 'inbound'
      and nm.sent_at >= q.created_at
      and nm.sent_at >= now() - interval '30 days'
      and nm.ai_label in ('human_reply', 'question', 'positive', 'neutral', 'routing')
  ) as replies_30d,
  count(nm.*) filter (
    where nm.direction = 'inbound'
      and nm.sent_at >= q.created_at
      and nm.sent_at >= now() - interval '30 days'
      and nm.ai_label = 'positive'
  ) as positives_30d
from public.nudge_variants v
left join public.nudge_assignments na on na.variant_id = v.id
left join public.send_queue q on q.id = na.queue_id
left join public.normalized_messages nm on nm.linked_thread_id = na.thread_id
group by v.campaign_id, v.id;

-- 4) Auto reweight function
create or replace function public.nudge_auto_reweight(p_campaign_id uuid, p_days int default 30)
returns jsonb
language plpgsql
security definer
as $$
declare
  cfg record;
  rec record;
  v_changed int := 0;
  v_items jsonb := '[]'::jsonb;
  v_start date := (now() - make_interval(days => coalesce(p_days, 30)))::date;
  v_end date := now()::date;
  metric_rate real;
begin
  select
    fr.auto_reweight_enabled,
    fr.reweight_min_sends,
    fr.reweight_metric,
    fr.reweight_floor,
    fr.reweight_ceiling,
    fr.reweight_smoothing
  into cfg
  from public.followup_rules fr
  where fr.campaign_id = p_campaign_id;

  if not found then
    raise exception 'campaign missing followup_rules';
  end if;

  -- Collect current performance for this campaign & window
  drop table if exists _perf;
  create temporary table _perf on commit drop as
  select
    v.variant_id,
    v.scenario,
    v.tone,
    v.weight,
    v.sends_30d as sends,
    v.replies_30d as replies,
    v.positives_30d as positives
  from public.v_variant_perf_30d v
  where v.campaign_id = p_campaign_id;

  drop table if exists _bucket;
  create temporary table _bucket on commit drop as
  select scenario,
         tone,
         sum(sends) as bucket_sends
  from _perf
  group by scenario, tone;

  drop table if exists _scores;
  create temporary table _scores (
    variant_id uuid,
    scenario text,
    tone text,
    raw_score real
  ) on commit drop;

  -- Iterate buckets and compute scores
  for rec in
    select p.variant_id,
           p.scenario,
           p.tone,
           p.weight,
           p.sends,
           p.replies,
           p.positives,
           b.bucket_sends
    from _perf p
    join _bucket b using (scenario, tone)
    order by p.scenario, p.tone
  loop
    -- Skip buckets without enough volume
    if rec.bucket_sends < cfg.reweight_min_sends then
      continue;
    end if;

    if cfg.reweight_metric = 'positive' then
      metric_rate := (rec.positives + cfg.reweight_smoothing)::real
                   / (rec.sends + (cfg.reweight_smoothing * 2))::real;
    else
      metric_rate := (rec.replies + cfg.reweight_smoothing)::real
                   / (rec.sends + (cfg.reweight_smoothing * 2))::real;
    end if;

    insert into _scores(variant_id, scenario, tone, raw_score)
    values (rec.variant_id, rec.scenario, rec.tone, greatest(1e-6, metric_rate));
  end loop;

  if not exists (select 1 from _scores) then
    return jsonb_build_object('ok', true, 'changed', 0, 'items', '[]'::jsonb);
  end if;

  -- Apply updates and write audit records
  for rec in
    with bucket_stats as (
      select scenario, tone, avg(raw_score) as avg_score
      from _scores
      group by scenario, tone
    ),
    targets as (
      select s.variant_id,
             s.scenario,
             s.tone,
             case when bs.avg_score = 0 then 1
                  else s.raw_score / bs.avg_score
             end as scaled
      from _scores s
      join bucket_stats bs using (scenario, tone)
    )
    select
      v.id as variant_id,
      v.campaign_id,
      v.scenario,
      v.tone,
      v.weight as old_weight,
      least(cfg.reweight_ceiling, greatest(cfg.reweight_floor, t.scaled))::real as new_weight,
      (select sends from _perf where variant_id = v.id) as sends,
      (select replies from _perf where variant_id = v.id) as replies,
      (select positives from _perf where variant_id = v.id) as positives
    from public.nudge_variants v
    join targets t on t.variant_id = v.id
    where v.campaign_id = p_campaign_id
      and v.is_active = true
  loop
    if rec.old_weight is distinct from rec.new_weight then
      update public.nudge_variants
        set weight = rec.new_weight
      where id = rec.variant_id;

      insert into public.variant_weight_audit
        (campaign_id, scenario, tone, variant_id, old_weight, new_weight, basis, window_start, window_end, stats)
      values
        (p_campaign_id, rec.scenario, rec.tone, rec.variant_id, rec.old_weight, rec.new_weight,
         cfg.reweight_metric || '_rate',
         v_start, v_end,
         jsonb_build_object('sends', rec.sends, 'replies', rec.replies, 'positives', rec.positives));

      v_changed := v_changed + 1;
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'variant_id', rec.variant_id,
        'scenario', rec.scenario,
        'tone', rec.tone,
        'old', rec.old_weight,
        'new', rec.new_weight
      ));
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'changed', coalesce(v_changed, 0), 'items', v_items);
end;
$$;

