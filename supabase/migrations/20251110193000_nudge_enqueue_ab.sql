create or replace function public._nz(txt text, def text)
returns text
language sql
immutable
as $$
select coalesce(nullif(txt, ''), def)
$$;

set check_function_bodies = off;

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
  v_candidates int;
  v_variant record;
  v_subject text;
  v_body text;
  v_sq uuid;
  v_lead record;
  v_pref record;
  v_scenario text;
  v_tone text;
  v_cap jsonb;
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

  select count(*)::int
  into v_candidates
  from public.nudge_variants
  where campaign_id = v_t.campaign_id
    and scenario = v_scenario
    and tone = v_tone
    and is_active = true;

  if v_candidates > 0 then
    select *
    into v_variant
    from public.nudge_variants
    where campaign_id = v_t.campaign_id
      and scenario = v_scenario
      and tone = v_tone
      and is_active = true
    order by (-ln(greatest(1e-9, random()))) / greatest(0.0001, weight)
    limit 1;
  else
    select *
    into v_variant
    from public.nudge_variants
    where campaign_id = v_t.campaign_id
      and scenario = v_scenario
      and is_active = true
    order by (-ln(greatest(1e-9, random()))) / greatest(0.0001, weight)
    limit 1;
  end if;

  if v_variant.id is null then
    return query select false, 'no_variant', null::uuid, null::uuid, v_scenario, v_tone;
    return;
  end if;

  select public.nudge_cap_check(v_t.campaign_id, v_scenario, v_tone)
  into v_cap;

  if (v_cap->>'ok')::boolean is distinct from true then
    raise exception 'cap_reached: used=% cap=%', (v_cap->>'used')::int, nullif(v_cap->>'cap', '')::int;
  end if;

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

revoke all on function public.nudge_enqueue_ab(uuid) from public;
grant execute on function public.nudge_enqueue_ab(uuid) to authenticated;

