-- RPC: build queue for a campaign (respects caps/windows)
-- This RPC picks eligible leads, chooses mailboxes, schedules items inside window and caps

create or replace function public.build_send_queue(
  p_campaign uuid,
  p_mailboxes uuid[],        -- list of connected_accounts allowed for this campaign
  p_spacing_seconds int default 90  -- gap between sends per mailbox
)
returns int
language plpgsql
security definer
as $$
declare
  v_created int := 0;
  v_lead record;
  v_pick uuid;
  v_sched timestamptz;
  v_cap int;
  v_count int;
  v_now timestamptz := now();
  v_user_id uuid;
begin
  if array_length(p_mailboxes,1) is null then
    raise exception 'No mailboxes provided';
  end if;

  -- Get campaign user_id
  select user_id into v_user_id from public.campaigns where id = p_campaign;
  if v_user_id is null then
    raise exception 'Campaign not found';
  end if;

  -- Loop eligible leads (campaign leads with no queue row yet, not replied/closed)
  for v_lead in
    with eligible_leads as (
      select l.lead_id
      from public.campaign_leads l
      where l.campaign_id = p_campaign
        and not exists (
          select 1 from public.send_queue q
          where q.campaign_id = p_campaign and q.lead_id = l.lead_id
        )
        -- Optional: exclude replied/closed leads if you have that status
        -- and not exists (
        --   select 1 from public.leads ld
        --   where ld.id = l.lead_id 
        --     and ld.status in ('replied', 'closed', 'unsubscribed')
        -- )
    )
    select lead_id from eligible_leads
  loop
    -- Round robin pick: mailbox index = (v_created mod N) + 1
    v_pick := p_mailboxes[((v_created % array_length(p_mailboxes,1)) + 1)];

    -- Reset daily counter if day changed in mailbox TZ
    perform public.reset_mailbox_counter_if_new_day(v_pick);

    -- Check cap
    select daily_cap, daily_sent_count into v_cap, v_count
    from public.connected_accounts where id = v_pick;

    if v_cap is null then v_cap := 40; end if;
    if v_count is null then v_count := 0; end if;
    if v_count >= v_cap then
      -- skip this mailbox today; try next mailbox this turn
      v_pick := p_mailboxes[((v_created % array_length(p_mailboxes,1)) + 2)]; -- next
      if v_pick is null then
        -- all are at cap → stop building
        exit;
      end if;
      perform public.reset_mailbox_counter_if_new_day(v_pick);
      select daily_cap, daily_sent_count into v_cap, v_count from public.connected_accounts where id = v_pick;
      if v_count >= coalesce(v_cap, 40) then
        exit; -- second also capped; bail
      end if;
    end if;

    -- Schedule time: start from now or previously last scheduled for this mailbox
    -- Find last scheduled time for this mailbox (pending only)
    select max(scheduled_at) into v_sched
    from public.send_queue
    where mailbox_id = v_pick and status = 'pending';

    if v_sched is null or v_sched < v_now then
      v_sched := v_now;
    else
      v_sched := v_sched + make_interval(secs => p_spacing_seconds);
    end if;

    -- Snap to window start if outside
    v_sched := public.next_in_window(v_pick, v_sched);

    -- Insert queue row
    -- Note: We need to get subject/body from campaign or template
    -- For now, we'll insert with nulls and let the sender fill them, or you can join to campaign
    insert into public.send_queue (user_id, campaign_id, lead_id, mailbox_id, scheduled_at, status)
    values (
      v_user_id,
      p_campaign, 
      v_lead.lead_id, 
      v_pick, 
      v_sched,
      'pending'
    )
    on conflict (campaign_id, lead_id) do nothing;

    v_created := v_created + 1;
    -- optimistic: we leave cap increment to sender tick on actual send
  end loop;

  return v_created;
end
$$;

-- Grant execute permission
grant execute on function public.build_send_queue(uuid, uuid[], int) to authenticated, service_role;





