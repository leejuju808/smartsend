-- Block 18: Deliverability Engine - Helper Functions
-- SmartSend — Block 18: Helper functions for usage counting and warm-up advancement

-- 1) Function to count usage for an account (used by shouldSend gate)
create or replace function public.fn_usage_count_for_account(
  p_workspace_id uuid,
  p_account_email text,
  p_period text default 'day' -- 'hour' or 'day'
)
returns int
language plpgsql stable
as $$
declare
  v_count int;
  v_bucket timestamptz;
begin
  if p_period = 'day' then
    v_bucket := date_trunc('day', now());
  else
    v_bucket := date_trunc('hour', now());
  end if;

  select coalesce(count(*), 0) into v_count
  from public.send_queue
  where workspace_id = p_workspace_id
    and (metadata->>'sender_email')::text = p_account_email
    and status = 'sent'
    and sent_at >= v_bucket;

  return v_count;
end;
$$;

-- 2) Function to advance warm-up daily (call via cron)
create or replace function public.fn_warmup_advance()
returns void
language plpgsql
as $$
declare
  v_row record;
  v_new_cap int;
begin
  -- Process all active warm-up states
  for v_row in
    select id, workspace_id, account_email, day_index, daily_cap, paused
    from public.warmup_state
    where paused = false
  loop
    -- Reset sent_today counter if it's a new day
    update public.warmup_state
    set sent_today = 0,
        updated_at = now()
    where id = v_row.id
      and date_trunc('day', now()) > date_trunc('day', updated_at);

    -- Advance day_index and increase cap (linear ramp: +10 per day, max 200)
    if date_trunc('day', now()) > date_trunc('day', updated_at) then
      v_new_cap := least(v_row.daily_cap + 10, 200);
      
      update public.warmup_state
      set day_index = day_index + 1,
          daily_cap = v_new_cap,
          updated_at = now()
      where id = v_row.id;
    end if;
  end loop;
end;
$$;

-- 3) Function to check if we should send (throttle gate)
create or replace function public.should_send(
  p_workspace_id uuid,
  p_account_email text,
  p_recipient_email text
)
returns jsonb
language plpgsql stable
as $$
declare
  v_result jsonb;
  v_domain text;
  v_domain_rule record;
  v_warmup record;
  v_suppressed boolean;
  v_daily_sent int;
  v_hourly_sent int;
  v_domain_daily_sent int;
  v_domain_hourly_sent int;
  v_allowed boolean := true;
  v_reason text;
begin
  -- Extract recipient domain
  v_domain := lower(split_part(p_recipient_email, '@', 2));

  -- Check suppression list
  select exists(1) into v_suppressed
  from public.suppression_list
  where workspace_id = p_workspace_id
    and lower(email) = lower(p_recipient_email);

  if v_suppressed then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'suppressed'
    );
  end if;

  -- Get warm-up state
  select * into v_warmup
  from public.warmup_state
  where workspace_id = p_workspace_id
    and account_email = p_account_email
  limit 1;

  -- If warm-up enabled, check cap
  if v_warmup is not null and not v_warmup.paused then
    v_daily_sent := fn_usage_count_for_account(p_workspace_id, p_account_email, 'day');
    
    if v_daily_sent >= v_warmup.daily_cap then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'warmup_daily_cap',
        'details', jsonb_build_object(
          'sent', v_daily_sent,
          'cap', v_warmup.daily_cap
        )
      );
    end if;
  end if;

  -- Get domain-specific rules
  select * into v_domain_rule
  from public.domain_sending_rules
  where workspace_id = p_workspace_id
    and domain = v_domain
  limit 1;

  if v_domain_rule is not null then
    -- Check domain daily cap
    select coalesce(count(*), 0) into v_domain_daily_sent
    from public.send_queue
    where workspace_id = p_workspace_id
      and lower(to_email) like '%@' || v_domain
      and status = 'sent'
      and sent_at >= date_trunc('day', now());

    if v_domain_daily_sent >= v_domain_rule.daily_cap then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'domain_daily_cap',
        'details', jsonb_build_object(
          'domain', v_domain,
          'sent', v_domain_daily_sent,
          'cap', v_domain_rule.daily_cap
        )
      );
    end if;

    -- Check domain hourly cap
    select coalesce(count(*), 0) into v_domain_hourly_sent
    from public.send_queue
    where workspace_id = p_workspace_id
      and lower(to_email) like '%@' || v_domain
      and status = 'sent'
      and sent_at >= date_trunc('hour', now());

    if v_domain_hourly_sent >= v_domain_rule.hourly_cap then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'domain_hourly_cap',
        'details', jsonb_build_object(
          'domain', v_domain,
          'sent', v_domain_hourly_sent,
          'cap', v_domain_rule.hourly_cap
        )
      );
    end if;
  end if;

  -- All checks passed
  return jsonb_build_object('allowed', true);
end;
$$;

-- Grant execute to authenticated users
grant execute on function public.fn_usage_count_for_account(uuid, text, text) to authenticated;
grant execute on function public.fn_warmup_advance() to service_role;
grant execute on function public.should_send(uuid, text, text) to authenticated, service_role;

