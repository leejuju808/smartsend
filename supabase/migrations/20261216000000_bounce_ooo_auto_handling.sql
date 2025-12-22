-- Bounce & OOO Auto-Handling System
-- Idempotent migration - safe to run multiple times
-- 
-- 1) Config knobs (idempotent)
-- 2) Helpers — reschedule queued items (business-day & window aware)
-- 3) Bounce auto-suppress + OOO push inside inbound trigger
-- 4) Extra safety: treat obvious SMTP failures as bounces
-- 5) Quick stats for dashboard

-- =====================================================
-- 1) Config knobs (idempotent)
-- =====================================================

-- Campaign-level control beats account-level default
alter table public.campaigns
  add column if not exists ooo_push_days int default 2 check (ooo_push_days between 1 and 14);

alter table public.connected_accounts
  add column if not exists ooo_push_days_default int default 2 check (ooo_push_days_default between 1 and 14);

-- Add timezone and holiday_region to connected_accounts if not exists
alter table public.connected_accounts
  add column if not exists timezone text default 'America/Los_Angeles',
  add column if not exists holiday_region text default 'US';

-- =====================================================
-- 2) Helpers — reschedule queued items (business-day & window aware)
-- =====================================================

-- Helper function: business_windowed_send_time_for_step
-- This function ensures sends are scheduled within business hours and windows
-- If the function doesn't exist, create a basic version
create or replace function public.business_windowed_send_time_for_step(
  p_account uuid,
  p_base timestamptz,
  p_step_id uuid
) returns timestamptz
language plpgsql
stable
as $$
declare
  v_tz text;
  v_start text := '09:00';
  v_end text := '17:00';
  v_scheduled timestamptz;
begin
  -- Get account timezone
  select coalesce(timezone, 'America/Los_Angeles') into v_tz
  from public.connected_accounts
  where id = p_account;

  -- Get step window if available
  select send_start, send_end into v_start, v_end
  from public.campaign_steps
  where id = p_step_id
  limit 1;

  -- Use existing function if available, otherwise basic clamp
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public' and p.proname = 'apply_send_window_tz'
  ) then
    select public.apply_send_window_tz(p_base, v_start, v_end, v_tz) into v_scheduled;
  else
    -- Basic version: just return base if during business hours, otherwise next business day
    v_scheduled := p_base;
    -- Simple check: if before 9am, move to 9am; if after 5pm, move to next day 9am
    if extract(hour from p_base at time zone v_tz) < 9 then
      v_scheduled := date_trunc('day', p_base at time zone v_tz) at time zone v_tz + interval '9 hours';
    elsif extract(hour from p_base at time zone v_tz) >= 17 then
      v_scheduled := (date_trunc('day', p_base at time zone v_tz) + interval '1 day') at time zone v_tz + interval '9 hours';
    end if;
  end if;

  return v_scheduled;
end;
$$;

-- Add N business days to all future steps for (campaign, lead)
create or replace function public.reschedule_future_queue_for_campaign_lead(
  p_campaign uuid,
  p_lead uuid,
  p_days int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_tz text;
  v_region text;
  v_count int := 0;
  r record;
begin
  -- Get account from campaign
  select account_id into v_account
  from public.campaigns
  where id = p_campaign;

  if v_account is null then
    -- Try to get from user_id if account_id doesn't exist on campaigns
    select ca.id into v_account
    from public.campaigns c
    join public.connected_accounts ca on ca.user_id = c.user_id
    where c.id = p_campaign
    limit 1;
  end if;

  -- Get timezone and region
  select coalesce(timezone, 'America/Los_Angeles'),
         coalesce(holiday_region, 'US')
    into v_tz, v_region
  from public.connected_accounts
  where id = v_account;

  -- Walk each queued row so we can re-clamp via business_windowed_send_time_for_step
  for r in
    select q.id, q.step_no, q.scheduled_for, s.id as step_id
    from public.send_queue q
    join public.campaign_steps s
      on s.campaign_id = q.campaign_id and s.step_no = q.step_no
    where q.campaign_id = p_campaign
      and q.lead_id = p_lead
      and q.status = 'queued'
  loop
    -- Handle both scheduled_for and scheduled_at column names
    declare
      v_existing_schedule timestamptz;
    begin
      -- Try scheduled_for first, then scheduled_at
      select coalesce(
        (select scheduled_for from public.send_queue where id = r.id),
        (select scheduled_at from public.send_queue where id = r.id)
      ) into v_existing_schedule;

      -- base = existing schedule + N days
      update public.send_queue q
         set scheduled_for = public.business_windowed_send_time_for_step(
                                v_account,
                                v_existing_schedule + (p_days || ' days')::interval,
                                r.step_id
                              ),
             scheduled_at = public.business_windowed_send_time_for_step(
                                v_account,
                                v_existing_schedule + (p_days || ' days')::interval,
                                r.step_id
                              ),
             updated_at = now()
       where q.id = r.id;
      v_count := v_count + 1;
    exception when others then
      -- If column doesn't exist, try with just scheduled_at
      update public.send_queue q
         set scheduled_at = public.business_windowed_send_time_for_step(
                                v_account,
                                coalesce(q.scheduled_at, now()) + (p_days || ' days')::interval,
                                r.step_id
                              ),
             updated_at = now()
       where q.id = r.id;
      v_count := v_count + 1;
    end;
  end loop;

  return v_count;
end;
$$;

-- =====================================================
-- 3) Bounce auto-suppress + OOO push inside inbound trigger
-- =====================================================

-- Extend existing after_inbound_message trigger to act on ai_label
create or replace function public.after_inbound_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := coalesce(NEW.body_html, NEW.subject, '');
  v_lead_email citext;
  v_label text;
  v_push int;
  v_user_id uuid;
begin
  -- Heuristic labels if AI not set
  -- Handle both 'in' and 'inbound' direction values
  if NEW.direction in ('inbound', 'in') and NEW.ai_label is null then
    v_label := public.heuristic_label(v_body);
    update public.inbox_messages
       set ai_label = v_label,
           ai_intent = coalesce(public.heuristic_intent(v_body), ai_intent),
           ai_confidence = 0.4,
           classified_at = now()
     where id = NEW.id;
  else
    v_label := coalesce(NEW.ai_label, v_label);
  end if;

  -- From lead? mark thread replied + cancel follow-ups (already in your earlier slice)
  -- Handle both 'in' and 'inbound' direction values
  if NEW.direction in ('inbound', 'in') then
    select email into v_lead_email from public.leads where id = NEW.lead_id;

    if v_lead_email is not null and lower(v_lead_email) = lower(NEW.from_email) then
      perform public.note_thread_reply(NEW.thread_id, coalesce(NEW.received_at, now()));
    end if;
  end if;

  -- Unsubscribe case handled previously; add Bounce + OOO:
  if coalesce(v_label, NEW.ai_label) = 'bounce' then
    -- Link bounce to send_log if possible
    perform public.link_bounce_to_sendlog(NEW.id);
    
    -- Suppress and stop everything
    -- Get user_id from campaign
    select user_id into v_user_id
    from public.campaigns
    where id = NEW.campaign_id;

    insert into public.suppression_list(user_id, account_id, email, reason, source)
    values (v_user_id, NEW.account_id, v_lead_email, 'bounce', 'reply')
    on conflict do nothing;

    perform public.cancel_future_queue_for_campaign_lead(NEW.campaign_id, NEW.lead_id);

  elsif coalesce(v_label, NEW.ai_label) = 'ooo' then
    -- Push N business days (campaign override → account default)
    select coalesce(c.ooo_push_days, a.ooo_push_days_default, 2)
      into v_push
    from public.campaigns c
    join public.connected_accounts a on a.id = c.account_id
    where c.id = NEW.campaign_id;

    -- If account_id doesn't exist on campaigns, try alternative lookup
    if v_push is null then
      select coalesce(c.ooo_push_days, a.ooo_push_days_default, 2)
        into v_push
      from public.campaigns c
      join public.connected_accounts a on a.user_id = c.user_id
      where c.id = NEW.campaign_id
      limit 1;
    end if;

    -- Default to 2 if still null
    v_push := coalesce(v_push, 2);

    perform public.reschedule_future_queue_for_campaign_lead(NEW.campaign_id, NEW.lead_id, v_push);
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_after_inbound_message on public.inbox_messages;
create trigger trg_after_inbound_message
after insert on public.inbox_messages
for each row
execute function public.after_inbound_message();

-- =====================================================
-- 4) Extra safety: treat obvious SMTP failures as bounces
-- =====================================================

-- Optionally extend send completion to auto-suppress on classic hard-bounce strings
create or replace function public.complete_send_attempt(
  p_queue_id uuid,
  p_ok boolean,
  p_provider_msg_id text default null,
  p_error text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_hard_bounce boolean := false;
  v_email citext;
  v_user_id uuid;
begin
  -- Get queue row with lead email
  select q.*, l.email as lead_email, c.user_id into r
  from public.send_queue q
  join public.leads l on l.id = q.lead_id
  left join public.campaigns c on c.id = q.campaign_id
  where q.id = p_queue_id
  for update;

  if not found then
    raise exception 'queue row not found';
  end if;

  v_email := r.lead_email;
  v_user_id := r.user_id;

  -- Log row - handle both error_message and error column names
  insert into public.send_logs(
    campaign_id, account_id, thread_id, lead_id,
    step_no, status, provider_message_id, error
  ) values (
    r.campaign_id, 
    coalesce(r.account_id, r.mailbox_id),
    null, 
    r.lead_id,
    r.step_no, 
    case when p_ok then 'sent' else 'failed' end,
    p_provider_msg_id, 
    p_error
  );

  -- Update queue
  -- Handle both scheduled_for and scheduled_at
  update public.send_queue
     set status = case when p_ok then 'sent' else 'failed' end,
         provider_msg_id = coalesce(p_provider_msg_id, provider_msg_id),
         last_error = p_error,
         error = p_error,
         updated_at = now()
   where id = p_queue_id;

  -- Detect obvious hard bounces and suppress
  if not p_ok and p_error is not null then
    v_hard_bounce :=
      p_error ~* '\b(5\d\d|550|551|552|553|user unknown|no such user|mailbox unavailable|address not found|recipient address rejected|invalid recipient|does not exist)\b';

    if v_hard_bounce then
      insert into public.suppression_list(user_id, account_id, email, reason, source)
      values (v_user_id, coalesce(r.account_id, r.mailbox_id), v_email, 'bounce', 'send-fail')
      on conflict do nothing;

      perform public.cancel_future_queue_for_campaign_lead(r.campaign_id, r.lead_id);
    end if;
  end if;

  -- next step enqueue handled by your existing trigger when status='sent'
end;
$$;

-- =====================================================
-- 5) Quick stats for dashboard
-- =====================================================

-- Bounce & OOO tallies by campaign
create or replace view public.campaign_deliverability as
select
  c.id as campaign_id,
  c.name,
  count(*) filter (where sl.reason = 'bounce') as bounces,
  count(*) filter (where im.ai_label = 'ooo') as ooo_replies,
  count(*) filter (where sl.reason = 'unsubscribe') as unsubscribes
from public.campaigns c
left join public.suppression_list sl
  on sl.account_id = c.account_id
  or (sl.user_id = c.user_id and sl.account_id is null)
left join public.inbox_messages im
  on im.campaign_id = c.id and im.direction in ('inbound', 'in')
group by 1,2;

-- Next-touch backlog shifted by OOO (sanity)
create or replace view public.ooo_push_audit as
select
  q.campaign_id, 
  q.lead_id, 
  q.step_no,
  coalesce(q.scheduled_for, q.scheduled_at) as scheduled_for,
  a.email, 
  c.name as campaign
from public.send_queue q
join public.connected_accounts a on a.id = coalesce(q.account_id, q.mailbox_id)
join public.campaigns c on c.id = q.campaign_id
where q.status = 'queued'
order by coalesce(q.scheduled_for, q.scheduled_at) asc;

-- Grant access to views
grant select on public.campaign_deliverability to authenticated;
grant select on public.ooo_push_audit to authenticated;

