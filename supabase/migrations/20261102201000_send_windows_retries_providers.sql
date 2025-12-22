-- Send Windows + Retries + Provider OAuth
-- Campaign send windows, retry/backoff metadata, and provider OAuth support

-- =====================================================
-- 1. Campaign windows (local-time sends)
-- =====================================================
alter table public.campaigns
  add column if not exists tz text default 'America/Los_Angeles',
  add column if not exists send_window_start time,  -- e.g., '08:30'
  add column if not exists send_window_end time;  -- e.g., '11:30'

-- =====================================================
-- 2. Queue: retry/backoff metadata
-- =====================================================
alter table public.send_queue
  add column if not exists attempts int default 0,
  add column if not exists next_attempt_at timestamptz,      -- when it becomes eligible again
  add column if not exists last_error_code text;             -- provider/status hint

create index if not exists idx_send_queue_next_attempt
  on public.send_queue (next_attempt_at) where status in ('queued','sending');

-- =====================================================
-- 3. Connected accounts: provider + OAuth (if not already present)
-- =====================================================
-- Add columns only if they don't exist to support the new credential system
do $$
begin
  -- Add scopes if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'connected_accounts' and column_name = 'scopes'
  ) then
    alter table public.connected_accounts add column scopes text[];
  end if;
  
  -- Add provider_email if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'connected_accounts' and column_name = 'provider_email'
  ) then
    alter table public.connected_accounts add column provider_email text;
  end if;
end $$;

-- =====================================================
-- 4. Helper: compute "now in campaign's local date"
-- =====================================================
create or replace function public.in_send_window(p_campaign uuid)
returns boolean
language plpgsql
stable
as $$
declare
  v_tz text; v_start time; v_end time; v_now time;
begin
  select tz, send_window_start, send_window_end
    into v_tz, v_start, v_end
  from public.campaigns where id = p_campaign;

  if v_start is null or v_end is null then
    return true; -- no window configured
  end if;

  v_now := (now() at time zone coalesce(v_tz,'UTC'))::time;

  if v_start <= v_end then
    return v_now >= v_start and v_now <= v_end;        -- normal window
  else
    return v_now >= v_start or v_now <= v_end;         -- window crosses midnight
  end if;
end;
$$;

-- =====================================================
-- 5. Helper: compute next window start
-- =====================================================
create or replace function public.next_window_start(p_campaign uuid)
returns timestamptz
language plpgsql
stable
as $$
declare v_tz text; v_start time; v_end time; v_now timestamptz; v_today date; v_ts timestamptz;
begin
  select tz, send_window_start, send_window_end into v_tz, v_start, v_end
  from public.campaigns where id = p_campaign;

  v_now := now();
  if v_start is null or v_end is null then
    return v_now; -- no window
  end if;

  v_today := (v_now at time zone coalesce(v_tz,'UTC'))::date;
  v_ts := (v_now at time zone coalesce(v_tz,'UTC')) at time zone 'UTC'; -- marker

  -- candidate today
  if (v_now at time zone coalesce(v_tz,'UTC'))::time <= v_start then
    return (timestamptz concat(v_today,' ',v_start)) at time zone coalesce(v_tz,'UTC');
  end if;

  -- else tomorrow at start
  return (timestamptz concat(v_today + 1, ' ', v_start)) at time zone coalesce(v_tz,'UTC');
end;
$$;

-- =====================================================
-- 6. Update queue builder to set scheduled_at
-- =====================================================
create or replace function public.generate_send_queue(p_campaign uuid)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_count int := 0; r record; v_mailbox uuid; v_sched timestamptz;
begin
  if not can_edit_campaign(p_campaign) then raise exception 'not authorized'; end if;

  select c.mailbox_id into v_mailbox from public.campaigns c where c.id = p_campaign;
  if v_mailbox is null then
    select id into v_mailbox
    from public.connected_accounts
    where user_id = (select user_id from public.campaigns where id = p_campaign)
    order by created_at asc limit 1;
  end if;
  if v_mailbox is null then raise exception 'no mailbox connected'; end if;

  v_sched := case when in_send_window(p_campaign) then now() else next_window_start(p_campaign) end;

  for r in
    select l.id as lead_id, l.user_id, l.campaign_id, l.subject, l.body_html
    from public.campaign_leads l
    where l.campaign_id = p_campaign
      and coalesce(l.is_active, true)
      and not exists (select 1 from public.send_queue q where q.campaign_id = l.campaign_id and q.lead_id = l.id)
  loop
    insert into public.send_queue(user_id, campaign_id, lead_id, mailbox_id, subject, body_html, scheduled_at, status, next_attempt_at)
    values (r.user_id, r.campaign_id, r.lead_id, v_mailbox, r.subject, r.body_html, v_sched, 'queued', v_sched);
    insert into public.send_logs(user_id, campaign_id, mailbox_id, lead_id, event, detail)
    values (r.user_id, r.campaign_id, v_mailbox, r.lead_id, 'enqueued', jsonb_build_object('reason','launch'));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Grant permissions
grant execute on function public.in_send_window(uuid) to service_role, authenticated;
grant execute on function public.next_window_start(uuid) to service_role, authenticated;

