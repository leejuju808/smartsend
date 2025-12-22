-- 20251109201000_nudge_presets_rpcs.sql
-- RPC helpers for nudge presets management (scenarios and tones)

create or replace function public.upsert_scenario_preset(
  p_campaign uuid,
  p_key text,
  p_label text,
  p_sort int default 100,
  p_is_active boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_campaign_editor(p_campaign) then
    raise exception 'forbidden';
  end if;

  insert into public.nudge_scenario_presets(campaign_id, key, label, sort, is_active)
  values (p_campaign, p_key, p_label, coalesce(p_sort, 100), coalesce(p_is_active, true))
  on conflict (campaign_id, key) do update
    set label = excluded.label,
        sort = excluded.sort,
        is_active = excluded.is_active;
end;
$$;

revoke all on function public.upsert_scenario_preset(uuid, text, text, int, boolean) from public;
grant execute on function public.upsert_scenario_preset(uuid, text, text, int, boolean) to authenticated;


create or replace function public.archive_scenario_preset(
  p_campaign uuid,
  p_key text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_campaign_editor(p_campaign) then
    raise exception 'forbidden';
  end if;

  update public.nudge_scenario_presets
    set is_active = false
  where campaign_id = p_campaign
    and key = p_key;
end;
$$;

revoke all on function public.archive_scenario_preset(uuid, text) from public;
grant execute on function public.archive_scenario_preset(uuid, text) to authenticated;


create or replace function public.upsert_tone_preset(
  p_campaign uuid,
  p_key text,
  p_label text,
  p_sort int default 100,
  p_is_active boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_campaign_editor(p_campaign) then
    raise exception 'forbidden';
  end if;

  insert into public.nudge_tone_presets(campaign_id, key, label, sort, is_active)
  values (p_campaign, p_key, p_label, coalesce(p_sort, 100), coalesce(p_is_active, true))
  on conflict (campaign_id, key) do update
    set label = excluded.label,
        sort = excluded.sort,
        is_active = excluded.is_active;
end;
$$;

revoke all on function public.upsert_tone_preset(uuid, text, text, int, boolean) from public;
grant execute on function public.upsert_tone_preset(uuid, text, text, int, boolean) to authenticated;


create or replace function public.archive_tone_preset(
  p_campaign uuid,
  p_key text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_campaign_editor(p_campaign) then
    raise exception 'forbidden';
  end if;

  update public.nudge_tone_presets
    set is_active = false
  where campaign_id = p_campaign
    and key = p_key;
end;
$$;

revoke all on function public.archive_tone_preset(uuid, text) from public;
grant execute on function public.archive_tone_preset(uuid, text) to authenticated;


create or replace function public.clone_global_nudge_presets(
  p_campaign uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_campaign_editor(p_campaign) then
    raise exception 'forbidden';
  end if;

  insert into public.nudge_scenario_presets(campaign_id, key, label, sort, is_active)
  select p_campaign, key, label, sort, is_active
  from public.nudge_scenario_presets
  where campaign_id is null
  on conflict (campaign_id, key) do nothing;

  insert into public.nudge_tone_presets(campaign_id, key, label, sort, is_active)
  select p_campaign, key, label, sort, is_active
  from public.nudge_tone_presets
  where campaign_id is null
  on conflict (campaign_id, key) do nothing;
end;
$$;

revoke all on function public.clone_global_nudge_presets(uuid) from public;
grant execute on function public.clone_global_nudge_presets(uuid) to authenticated;


