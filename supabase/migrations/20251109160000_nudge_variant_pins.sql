-- A) Pin flags on variants (optional locked weight override)
alter table public.nudge_variants
  add column if not exists pinned boolean not null default false,
  add column if not exists pinned_weight real;

-- Guard to ensure pinned_weight is positive when set on a pinned variant
create or replace function public.nudge_variants_pinned_weight_check()
returns trigger
language plpgsql
as $$
begin
  if NEW.pinned and NEW.pinned_weight is not null and NEW.pinned_weight <= 0 then
    raise exception 'pinned_weight must be > 0 when provided';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_nv_pin_check on public.nudge_variants;
create trigger trg_nv_pin_check
before insert or update on public.nudge_variants
for each row execute procedure public.nudge_variants_pinned_weight_check();

-- B) Ensure followup_rules knobs exist
alter table public.followup_rules
  add column if not exists auto_reweight_enabled boolean not null default false,
  add column if not exists reweight_min_sends int not null default 25,
  add column if not exists reweight_metric text not null default 'reply',
  add column if not exists reweight_floor real not null default 0.5,
  add column if not exists reweight_ceiling real not null default 3.0,
  add column if not exists reweight_smoothing real not null default 5.0;

-- C) Patch the auto-reweight function to respect pins
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
begin
  select fr.* into cfg
  from public.followup_rules fr
  where fr.campaign_id = p_campaign_id;

  if not found then
    raise exception 'campaign missing followup_rules';
  end if;

  drop table if exists _perf;
  create temporary table _perf on commit drop as
  select
    v.id as variant_id,
    v.scenario,
    v.tone,
    v.weight,
    v.pinned,
    v.pinned_weight,
    count(na.*) filter (
      where q.created_at >= now() - make_interval(days => coalesce(p_days, 30))
    ) as sends,
    count(nm.*) filter (
      where nm.direction = 'inbound'
        and nm.sent_at >= q.created_at
        and nm.sent_at >= now() - make_interval(days => coalesce(p_days, 30))
        and nm.ai_label in ('human_reply', 'question', 'positive', 'neutral', 'routing')
    ) as replies,
    count(nm.*) filter (
      where nm.direction = 'inbound'
        and nm.sent_at >= q.created_at
        and nm.sent_at >= now() - make_interval(days => coalesce(p_days, 30))
        and nm.ai_label = 'positive'
    ) as positives
  from public.nudge_variants v
  left join public.nudge_assignments na on na.variant_id = v.id
  left join public.send_queue q on q.id = na.queue_id
  left join public.normalized_messages nm on nm.linked_thread_id = na.thread_id
  where v.campaign_id = p_campaign_id
    and v.is_active = true
  group by v.id;

  drop table if exists _bucket;
  create temporary table _bucket on commit drop as
  select scenario, tone, sum(sends) as bucket_sends
  from _perf
  group by scenario, tone;

  drop table if exists _scores;
  create temporary table _scores (
    variant_id uuid,
    scenario text,
    tone text,
    raw_score real
  ) on commit drop;

  insert into _scores
  select
    p.variant_id,
    p.scenario,
    p.tone,
    case
      when cfg.reweight_metric = 'positive' then
        (p.positives + cfg.reweight_smoothing)::real / (p.sends + (cfg.reweight_smoothing * 2))::real
      else
        (p.replies + cfg.reweight_smoothing)::real / (p.sends + (cfg.reweight_smoothing * 2))::real
    end as raw_score
  from _perf p
  join _bucket b using (scenario, tone)
  where b.bucket_sends >= cfg.reweight_min_sends
    and coalesce(p.pinned, false) = false;

  if not exists (select 1 from _scores) then
    return jsonb_build_object('ok', true, 'changed', 0, 'items', '[]'::jsonb);
  end if;

  for rec in
    with bucket_stats as (
      select scenario, tone, avg(raw_score) as avg_score
      from _scores
      group by scenario, tone
    ),
    targets as (
      select
        s.variant_id,
        s.scenario,
        s.tone,
        case when bs.avg_score = 0 then 1 else s.raw_score / bs.avg_score end as scaled
      from _scores s
      join bucket_stats bs using (scenario, tone)
    )
    select
      v.id as variant_id,
      v.scenario,
      v.tone,
      v.weight as old_weight,
      v.pinned,
      v.pinned_weight,
      coalesce(t.scaled, v.weight) as proposed,
      cfg.reweight_floor as floor,
      cfg.reweight_ceiling as ceil
    from public.nudge_variants v
    left join targets t on t.variant_id = v.id
    where v.campaign_id = p_campaign_id
      and v.is_active = true
  loop
    declare
      new_w real;
    begin
      if rec.pinned and rec.pinned_weight is not null then
        new_w := rec.pinned_weight;
      elsif rec.pinned and rec.pinned_weight is null then
        new_w := rec.old_weight;
      else
        new_w := least(rec.ceil, greatest(rec.floor, rec.proposed));
      end if;

      if rec.old_weight is distinct from new_w then
        update public.nudge_variants
        set weight = new_w
        where id = rec.variant_id;

        insert into public.variant_weight_audit (
          campaign_id,
          scenario,
          tone,
          variant_id,
          old_weight,
          new_weight,
          basis,
          window_start,
          window_end,
          stats
        )
        values (
          p_campaign_id,
          rec.scenario,
          rec.tone,
          rec.variant_id,
          rec.old_weight,
          new_w,
          'auto',
          v_start,
          v_end,
          jsonb_build_object('pinned', rec.pinned)
        );

        v_changed := v_changed + 1;
        v_items := v_items || jsonb_build_array(
          jsonb_build_object(
            'variant_id', rec.variant_id,
            'scenario', rec.scenario,
            'tone', rec.tone,
            'old', rec.old_weight,
            'new', new_w,
            'pinned', rec.pinned
          )
        );
      end if;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'changed', coalesce(v_changed, 0), 'items', v_items);
end;
$$;

-- D) Update metrics view to expose pin metadata
create or replace view public.v_nudge_variant_metrics as
with variants as (
  select
    v.id as variant_id,
    v.campaign_id,
    v.scenario,
    v.tone,
    v.name,
    v.subject,
    v.weight,
    v.is_active,
    v.pinned,
    v.pinned_weight
  from public.nudge_variants v
),
assignments as (
  select
    na.variant_id,
    count(*)::bigint as total_sent
  from public.nudge_assignments na
  group by na.variant_id
),
delivery_stats as (
  select
    na.variant_id,
    count(*) filter (where de.event_type = 'delivered')::bigint as delivered_count,
    count(*) filter (where de.event_type = 'bounced')::bigint as bounced_count
  from public.nudge_assignments na
  join public.send_queue q on q.id = na.queue_id
  join public.delivery_events de on de.queue_id = q.id
  group by na.variant_id
),
reply_stats as (
  select
    na.variant_id,
    count(distinct nm.id) filter (
      where nm.direction = 'inbound'
        and nm.ai_label in ('human_reply','question','positive','neutral','routing')
    )::bigint as total_replies,
    count(distinct nm.id) filter (
      where nm.direction = 'inbound'
        and nm.ai_label = 'positive'
    )::bigint as positive_replies
  from public.nudge_assignments na
  join public.normalized_messages nm on nm.linked_thread_id = na.thread_id
  group by na.variant_id
)
select
  v.variant_id,
  v.campaign_id,
  v.scenario,
  v.tone,
  v.name,
  v.subject,
  v.weight,
  v.is_active,
  v.pinned,
  v.pinned_weight,
  coalesce(a.total_sent, 0)::bigint as total_sent,
  coalesce(d.delivered_count, 0)::bigint as delivered_count,
  coalesce(d.bounced_count, 0)::bigint as bounced_count,
  coalesce(r.total_replies, 0)::bigint as total_replies,
  coalesce(r.positive_replies, 0)::bigint as positive_replies,
  case
    when coalesce(a.total_sent, 0) > 0
      then round(100.0 * coalesce(r.total_replies, 0) / coalesce(a.total_sent, 0), 2)
    else 0
  end as reply_rate,
  case
    when coalesce(a.total_sent, 0) > 0
      then round(100.0 * coalesce(r.positive_replies, 0) / coalesce(a.total_sent, 0), 2)
    else 0
  end as positive_rate,
  case
    when (coalesce(d.delivered_count, 0) + coalesce(d.bounced_count, 0)) > 0
      then round(
        100.0 * coalesce(d.delivered_count, 0) /
        (coalesce(d.delivered_count, 0) + coalesce(d.bounced_count, 0)),
        2
      )
    else 0
  end as delivery_rate
from variants v
left join assignments a on a.variant_id = v.variant_id
left join delivery_stats d on d.variant_id = v.variant_id
left join reply_stats r on r.variant_id = v.variant_id;

create or replace function public.nudge_variant_metrics_for_campaign(p_campaign_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'variant_id', variant_id,
        'scenario', scenario,
        'tone', tone,
        'name', name,
        'subject', subject,
        'weight', weight,
        'is_active', is_active,
        'pinned', pinned,
        'pinned_weight', pinned_weight,
        'total_sent', total_sent,
        'reply_rate', reply_rate,
        'positive_rate', positive_rate,
        'delivery_rate', delivery_rate
      )
      order by scenario, tone, name
    ),
    '[]'::jsonb
  )
  from public.v_nudge_variant_metrics
  where campaign_id = p_campaign_id;
$$;


