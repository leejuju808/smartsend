set search_path = public, pg_temp;

alter table public.followup_rules
  add column if not exists picker_mode text not null default 'explore',
  add column if not exists picker_epsilon real not null default 0.10;

create or replace function public.nudge_pick_variant(
  p_campaign_id uuid,
  p_scenario text,
  p_tone text
) returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $function$
declare
  cfg record;
  chosen uuid;
  do_explore boolean;
  smoothing real;
  mode text;
begin
  select picker_mode, picker_epsilon, reweight_smoothing
  into cfg
  from public.followup_rules
  where campaign_id = p_campaign_id;

  if not found then
    raise exception 'missing followup_rules for campaign %', p_campaign_id;
  end if;

  smoothing := coalesce(cfg.reweight_smoothing, 5.0);
  mode := lower(coalesce(cfg.picker_mode, 'explore'));

  do_explore := random() < greatest(0, least(1, coalesce(cfg.picker_epsilon, 0)));

  create temporary table _cands on commit drop as
  select
    v.id,
    greatest(1e-6, v.weight) as weight,
    coalesce(p.sends_30d, 0)::real as sends,
    coalesce(p.replies_30d, 0)::real as replies,
    coalesce(p.positives_30d, 0)::real as positives
  from public.nudge_variants v
  left join public.v_variant_perf_30d p on p.variant_id = v.id
  where v.campaign_id = p_campaign_id
    and v.scenario = p_scenario
    and v.tone = p_tone
    and v.is_active = true;

  if not exists (select 1 from _cands) then
    return null;
  end if;

  create temporary table _scores on commit drop as
  select
    id,
    weight,
    case
      when do_explore then null::real
      when mode = 'exploit' then
        weight * ((replies + smoothing) / greatest(1.0, sends + (smoothing * 2)))
      else
        weight * (1.0 / greatest(1.0, 1.0 + sends))
    end as score
  from _cands;

  if do_explore then
    select id into chosen
    from _cands
    order by random()
    limit 1;

    return chosen;
  end if;

  if not exists (select 1 from _scores where coalesce(score, 0) > 0) then
    select id into chosen
    from _cands
    order by random() * weight desc
    limit 1;

    return chosen;
  end if;

  select id into chosen
  from _scores
  order by random() * score desc
  limit 1;

  return chosen;
end
$function$;

create or replace function public.nudge_enqueue_ab(p_thread uuid)
returns table(
  ok boolean,
  reason text,
  send_queue_id uuid,
  variant_id uuid,
  scenario text,
  tone text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_t record;
  v_rule record;
  v_last_in record;
  v_last_nudge timestamptz;
  v_cnt24 int;
  v_variant record;
  v_variant_id uuid;
  v_subject text;
  v_body text;
  v_sq uuid;
  v_lead record;
  v_pref record;
  v_scenario text;
  v_tone text;
begin
  select id, campaign_id, lead_id, subject
  into v_t
  from public.inbox_threads
  where id = p_thread
  for update;

  if v_t.id is null then
    return query select false, 'thread_not_found', null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  if not public.is_campaign_editor(v_t.campaign_id) then
    return query select false, 'forbidden', null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  select
    coalesce(ab_enabled, false) as ab_enabled,
    coalesce(tone, 'professional') as tone,
    coalesce(nudge_min_gap_minutes, 1440) as nudge_min_gap_minutes,
    coalesce(lead_daily_cap, 1) as lead_daily_cap
  into v_rule
  from public.followup_rules
  where campaign_id = v_t.campaign_id;

  v_tone := v_rule.tone;

  select ai_label
  into v_last_in
  from public.v_thread_last_inbound
  where thread_id = v_t.id;

  v_scenario := regexp_replace(coalesce(v_last_in.ai_label, 'no_reply'), '[^a-z_]', '', 'g');

  select max(created_at)
  into v_last_nudge
  from public.nudge_assignments
  where thread_id = v_t.id;

  if v_last_nudge is not null
     and extract(epoch from (now() - v_last_nudge)) / 60.0 < v_rule.nudge_min_gap_minutes then
    return query select false, 'thread_cooldown', null::uuid, null::uuid, v_scenario, v_tone;
    return;
  end if;

  select count(*)::int
  into v_cnt24
  from public.nudge_assignments
  where campaign_id = v_t.campaign_id
    and lead_id = v_t.lead_id
    and created_at >= now() - interval '24 hours';

  if v_cnt24 >= v_rule.lead_daily_cap then
    return query select false, 'lead_daily_cap', null::uuid, null::uuid, v_scenario, v_tone;
    return;
  end if;

  select public.nudge_pick_variant(v_t.campaign_id, v_scenario, v_tone)
  into v_variant_id;

  if v_variant_id is null then
    return query select false, 'no_variant', null::uuid, null::uuid, v_scenario, v_tone;
    return;
  end if;

  select *
  into v_variant
  from public.nudge_variants
  where id = v_variant_id;

  if v_variant.id is null then
    return query select false, 'no_variant', null::uuid, null::uuid, v_scenario, v_tone;
    return;
  end if;

  v_tone := coalesce(v_variant.tone, v_tone);

  select first_name, last_name, company, email
  into v_lead
  from public.leads
  where id = v_t.lead_id;

  select duration_min, booking_link
  into v_pref
  from public.meeting_prefs
  where campaign_id = v_t.campaign_id;

  v_subject := coalesce(v_t.subject, v_variant.subject);
  v_body := v_variant.body;
  v_body := replace(v_body, '{lead_first}', public._nz(v_lead.first_name, ''));
  v_body := replace(v_body, '{company}', public._nz(v_lead.company, ''));
  v_body := replace(v_body, '{me}', 'SmartSend');
  v_body := replace(v_body, '{duration}', coalesce(v_pref.duration_min::text, '30'));
  v_body := replace(v_body, '{booking_link}', public._nz(v_pref.booking_link, ''));
  v_body := replace(v_body, '{last_msg}', '');
  v_body := replace(v_body, '{cta}', 'Open to a quick intro?');

  insert into public.send_queue (campaign_id, lead_id, thread_id, subject, body, headers, status, source)
  values (
    v_t.campaign_id,
    v_t.lead_id,
    v_t.id,
    'Re: ' || public._nz(v_subject, v_variant.subject),
    v_body,
    jsonb_build_object('to', v_lead.email),
    'draft',
    'nudge_ab'
  )
  returning id
  into v_sq;

  insert into public.nudge_assignments (thread_id, campaign_id, lead_id, send_queue_id, variant_id, scenario, tone)
  values (v_t.id, v_t.campaign_id, v_t.lead_id, v_sq, v_variant.id, v_scenario, v_tone);

  return query select true, null::text, v_sq, v_variant.id, v_scenario, v_tone;
end
$function$;

revoke all on function public.nudge_pick_variant(uuid, text, text) from public;
grant execute on function public.nudge_pick_variant(uuid, text, text) to authenticated;

revoke all on function public.nudge_enqueue_ab(uuid) from public;
grant execute on function public.nudge_enqueue_ab(uuid) to authenticated;


