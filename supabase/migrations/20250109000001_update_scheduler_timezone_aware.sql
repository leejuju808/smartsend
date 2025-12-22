-- Update scheduler to use timezone-aware window function

create or replace function public.schedule_followups_for_campaign(
  p_campaign uuid,
  p_from_step int default 1,
  p_limit int default 500
) returns int
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid;
  v_account uuid;
  v_daily_cap int;
  v_step int := p_from_step + 1;             -- we schedule the "next" step
  v_offset int := 2;
  v_start text; v_end text;
  v_count int := 0;

  v_today_start timestamptz := date_trunc('day', now());
  v_today_end   timestamptz := v_today_start + interval '1 day' - interval '1 millisecond';
  v_sent_today int := 0;
  v_remaining int := 0;
begin
  -- campaign context
  -- Get user_id and daily_cap from campaign
  -- For account_id, try to find from connected_accounts via user_id
  select c.user_id, 
         coalesce(c.daily_cap, 40) as daily_cap
    into v_user, v_daily_cap
  from public.campaigns c
  where c.id = p_campaign;
  
  -- Get account_id from connected_accounts (mailbox) for this user
  select id into v_account
  from public.connected_accounts
  where user_id = v_user
  limit 1;

  -- step config
  select offset_days, send_start, send_end
    into v_offset, v_start, v_end
  from public.campaign_steps
  where campaign_id = p_campaign and step_no = v_step and enabled = true;

  if v_offset is null then
    -- no enabled config for next step
    return 0;
  end if;

  -- compute today's remaining cap (sent today only)
  select count(*)::int into v_sent_today
  from public.send_logs
  where campaign_id = p_campaign and status='sent'
    and created_at between v_today_start and v_today_end;

  v_remaining := greatest(0, v_daily_cap - v_sent_today);

  -- NEW: also respect mailbox/account ramp
  if v_account is not null then
    declare
      v_acct_remaining int;
    begin
      select public.account_remaining_capacity(v_account, current_date) into v_acct_remaining;
      v_remaining := least(v_remaining, coalesce(v_acct_remaining, 0));
    end;
  end if;

  if v_remaining = 0 then
    return 0;
  end if;
  v_remaining := least(v_remaining, p_limit);

  -- candidates:
  -- leads that got step p_from_step sent,
  -- have NOT replied (threads.replied_at is null),
  -- are not opted out / bounced,
  -- and do NOT already have queue/log for step v_step
  with last_sent as (
    select sl.lead_id, min(sl.created_at) as first_sent, max(sl.created_at) as last_sent
    from public.send_logs sl
    where sl.campaign_id = p_campaign and sl.status='sent' and sl.step_no = p_from_step
    group by 1
  ),
  eligible as (
    select ls.lead_id, ls.last_sent
    from last_sent ls
    left join public.inbox_threads t on t.campaign_id = p_campaign and t.lead_id = ls.lead_id
    left join public.leads l on l.id = ls.lead_id
    left join lateral (
      select 1 from public.send_logs x
      where x.campaign_id = p_campaign and x.lead_id = ls.lead_id and x.step_no = v_step
      limit 1
    ) sent_next on true
    left join lateral (
      select 1 from public.send_queue q
      where q.campaign_id = p_campaign and q.lead_id = ls.lead_id and q.step_no = v_step and q.status in ('queued','sending')
      limit 1
    ) queued_next on true
    where coalesce(t.replied_at, null) is null
      and coalesce(l.opted_out_at, null) is null
      and coalesce(l.bounced_at, null) is null
      and sent_next is null
      and queued_next is null
      and (t.ooo_until is null or t.ooo_until <= now())
  ),
  plan as (
    select
      e.lead_id,
      public.apply_send_window_tz(
        e.last_sent + (v_offset || ' days')::interval,
        v_start, v_end,
        public.pick_lead_timezone(e.lead_id, p_campaign)
      ) as scheduled_at
    from eligible e
    order by scheduled_at asc
    limit v_remaining
  )
  insert into public.send_queue (
    user_id, campaign_id, lead_id, scheduled_at, status, step_no
  )
  select v_user, p_campaign, p.lead_id,
         greatest(p.scheduled_at, now()), 'queued', v_step
  from plan p
  on conflict (campaign_id, lead_id, step_no) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

