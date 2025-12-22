set search_path = public, pg_temp;

-- ============================================================================
-- Classifier settings table
-- ============================================================================
create table if not exists public.classifier_settings (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  min_hours_after_inbound int not null default 48,
  min_days_between_nudges int not null default 5,
  booking_link text,
  default_duration_min int not null default 30,
  default_tz text,
  ooo_default_days int not null default 14,
  ooo_banner_advance_hours int not null default 24,
  auto_draft_positive boolean not null default true,
  auto_draft_neutral boolean not null default true,
  auto_draft_negative boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.classifier_settings enable row level security;

drop policy if exists "classifier_settings_select" on public.classifier_settings;
create policy "classifier_settings_select" on public.classifier_settings
  for select
  to authenticated
  using (exists (
    select 1
      from public.campaign_members m
     where m.campaign_id = classifier_settings.campaign_id
       and m.user_id = auth.uid()
  ));

drop policy if exists "classifier_settings_insert" on public.classifier_settings;
create policy "classifier_settings_insert" on public.classifier_settings
  for insert
  to authenticated
  with check (exists (
    select 1
      from public.campaign_members m
     where m.campaign_id = classifier_settings.campaign_id
       and m.user_id = auth.uid()
  ));

drop policy if exists "classifier_settings_update" on public.classifier_settings;
create policy "classifier_settings_update" on public.classifier_settings
  for update
  to authenticated
  using (exists (
    select 1
      from public.campaign_members m
     where m.campaign_id = classifier_settings.campaign_id
       and m.user_id = auth.uid()
  ));

-- ============================================================================
-- Seed helper
-- ============================================================================
create or replace function public.ensure_classifier_settings(p_campaign uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  insert into public.classifier_settings (campaign_id, default_duration_min, default_tz)
  select p_campaign, coalesce(mp.duration_min, 30), mp.tz
    from public.meeting_prefs mp
   where mp.campaign_id = p_campaign
  on conflict (campaign_id) do nothing;
$$;

revoke all on function public.ensure_classifier_settings(uuid) from public;
grant execute on function public.ensure_classifier_settings(uuid) to authenticated;

-- ============================================================================
-- Throttle helper updates
-- ============================================================================
drop function if exists public.can_nudge_thread(uuid);

create or replace function public.can_nudge_thread(p_thread uuid)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_last_inbound timestamptz;
  v_last_nudge   timestamptz;
  v_campaign uuid;
  v_min_after_inbound int := 48;
  v_min_between int := 5;
begin
  select t.campaign_id into v_campaign
    from public.inbox_threads t
   where t.id = p_thread;

  if v_campaign is null then
    return false;
  end if;

  select
    cs.min_hours_after_inbound,
    cs.min_days_between_nudges
    into v_min_after_inbound,
         v_min_between
    from public.classifier_settings cs
   where cs.campaign_id = v_campaign;

  select last_inbound_at, last_nudge_at
    into v_last_inbound, v_last_nudge
    from public.v_thread_activity
   where thread_id = p_thread;

  if v_last_inbound is not null
     and v_last_inbound > now() - make_interval(hours => v_min_after_inbound) then
    return false;
  end if;

  if v_last_nudge is not null
     and v_last_nudge > now() - make_interval(days => v_min_between) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.can_nudge_thread(uuid) from public;
grant execute on function public.can_nudge_thread(uuid) to authenticated;

-- ============================================================================
-- Inbox label counters view
-- ============================================================================
drop view if exists public.v_inbox_label_counts;

create or replace view public.v_inbox_label_counts as
select
  t.campaign_id,
  count(*) filter (where t.reply_type is null) as untyped,
  count(*) filter (where t.reply_type = 'positive') as positive,
  count(*) filter (where t.reply_type = 'neutral') as neutral,
  count(*) filter (where t.reply_type = 'question') as question,
  count(*) filter (where t.reply_type = 'negative') as negative,
  count(*) filter (where t.reply_type = 'ooo') as ooo
from public.inbox_threads t
group by t.campaign_id;

alter view public.v_inbox_label_counts set (security_invoker = on);


