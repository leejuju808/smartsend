create or replace function public.nudge_pick(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_thread record;
  v_rule record;
  v_last record;
  v_variant record;
  v_scenario text := 'no_reply';
  v_tone text := 'professional';
begin
  select id, campaign_id
  into v_thread
  from public.inbox_threads
  where id = p_thread_id;

  if v_thread.id is null then
    raise exception 'thread not found' using detail = 'thread not found';
  end if;

  select tone
  into v_rule
  from public.followup_rules
  where campaign_id = v_thread.campaign_id;

  if v_rule.tone is not null then
    v_tone := v_rule.tone;
  end if;

  select ai_label
  into v_last
  from public.v_thread_last_inbound
  where thread_id = v_thread.id;

  v_scenario := regexp_replace(coalesce(v_last.ai_label, 'no_reply'), '[^a-z_]', '', 'g');

  with candidates as (
    select id, subject, body, tone, weight
    from public.nudge_variants
    where campaign_id = v_thread.campaign_id
      and scenario = v_scenario
      and tone = v_tone
      and is_active = true
  )
  select *
  into v_variant
  from candidates
  order by (-ln(greatest(1e-9, random()))) / greatest(0.0001, weight)
  limit 1;

  if v_variant.id is null then
    with fallback as (
      select id, subject, body, tone, weight
      from public.nudge_variants
      where campaign_id = v_thread.campaign_id
        and scenario = v_scenario
        and is_active = true
    )
    select *
    into v_variant
    from fallback
    order by (-ln(greatest(1e-9, random()))) / greatest(0.0001, weight)
    limit 1;
  end if;

  if v_variant.id is null then
    raise exception 'no_variant' using detail = 'no_variant';
  end if;

  return jsonb_build_object(
    'scenario', v_scenario,
    'tone', coalesce(v_variant.tone, v_tone),
    'variant', jsonb_build_object(
      'id', v_variant.id,
      'subject', v_variant.subject,
      'body', v_variant.body
    )
  );
end;
$$;

create or replace function public.nudge_enqueue_ab(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payload jsonb;
  v_thread record;
  v_last_nudge timestamptz;
  v_daily_count int := 0;
  v_variant_id uuid;
  v_variant record;
  v_lead record;
  v_pref record;
  v_subject text;
  v_body text;
  v_queue_id uuid;
  v_min_gap_minutes int := 1440;
  v_daily_cap int := 1;
begin
  select id, campaign_id, lead_id, subject
  into v_thread
  from public.inbox_threads
  where id = p_thread_id
  for update;

  if v_thread.id is null then
    raise exception 'thread not found' using detail = 'thread not found';
  end if;

  if not public.is_campaign_editor(v_thread.campaign_id) then
    raise exception 'forbidden' using detail = 'forbidden';
  end if;

  payload := public.nudge_pick(p_thread_id);
  v_variant_id := (payload->'variant'->>'id')::uuid;

  select coalesce(nudge_min_gap_minutes, v_min_gap_minutes),
         coalesce(lead_daily_cap, v_daily_cap)
  into v_min_gap_minutes, v_daily_cap
  from public.followup_rules
  where campaign_id = v_thread.campaign_id;

  select max(created_at)
  into v_last_nudge
  from public.nudge_assignments
  where thread_id = v_thread.id;

  if v_last_nudge is not null
     and v_min_gap_minutes > 0
     and v_last_nudge > now() - make_interval(mins => v_min_gap_minutes) then
    raise exception 'cooldown' using detail = 'cooldown';
  end if;

  select count(*)::int
  into v_daily_count
  from public.nudge_assignments
  where lead_id = v_thread.lead_id
    and campaign_id = v_thread.campaign_id
    and created_at >= now() - interval '24 hours';

  if v_daily_count >= v_daily_cap then
    raise exception 'daily cap' using detail = 'daily cap';
  end if;

  select subject, body, tone
  into v_variant
  from public.nudge_variants
  where id = v_variant_id;

  if v_variant.id is null then
    raise exception 'no_variant' using detail = 'no_variant';
  end if;

  select first_name, last_name, company, email
  into v_lead
  from public.leads
  where id = v_thread.lead_id;

  select duration_min, booking_link
  into v_pref
  from public.meeting_prefs
  where campaign_id = v_thread.campaign_id;

  v_subject := coalesce(v_thread.subject, v_variant.subject);
  v_body := v_variant.body;
  v_body := replace(v_body, '{lead_first}', public._nz(v_lead.first_name, ''));
  v_body := replace(v_body, '{company}', public._nz(v_lead.company, ''));
  v_body := replace(v_body, '{me}', 'SmartSend');
  v_body := replace(v_body, '{duration}', coalesce(v_pref.duration_min::text, '30'));
  v_body := replace(v_body, '{booking_link}', public._nz(v_pref.booking_link, ''));
  v_body := replace(v_body, '{last_msg}', '');
  v_body := replace(v_body, '{cta}', 'Open to a quick intro?');

  insert into public.send_queue (
    campaign_id,
    lead_id,
    thread_id,
    subject,
    body,
    headers,
    status,
    source
  )
  values (
    v_thread.campaign_id,
    v_thread.lead_id,
    v_thread.id,
    'Re: ' || public._nz(v_subject, v_variant.subject),
    v_body,
    jsonb_build_object('to', v_lead.email),
    'draft',
    'nudge_ab'
  )
  returning id into v_queue_id;

  insert into public.nudge_assignments (
    thread_id,
    campaign_id,
    lead_id,
    send_queue_id,
    variant_id,
    scenario,
    tone
  )
  values (
    v_thread.id,
    v_thread.campaign_id,
    v_thread.lead_id,
    v_queue_id,
    v_variant_id,
    payload->>'scenario',
    payload->>'tone'
  )
  on conflict do nothing;

  return jsonb_build_object(
    'queue_id', v_queue_id,
    'variant_id', v_variant_id,
    'scenario', payload->>'scenario',
    'tone', payload->>'tone'
  );
end;
$$;

revoke all on function public.nudge_pick(uuid) from public;
grant execute on function public.nudge_pick(uuid) to authenticated;

revoke all on function public.nudge_enqueue_ab(uuid) from public;
grant execute on function public.nudge_enqueue_ab(uuid) to authenticated;


