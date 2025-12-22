-- Block 187: Human Handoff + CRM Push - Handoff Trigger Function
-- Creates function to check handoff conditions and trigger handoff

-- Function to check if handoff should be triggered
create or replace function public.should_trigger_handoff(
  p_thread_id uuid
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_thread record;
  v_campaign record;
begin
  -- Get thread with campaign info
  select 
    rt.*,
    c.handoff_mode,
    c.handoff_destination,
    c.account_id as campaign_account_id
  into v_thread
  from public.reply_threads rt
  left join public.campaigns c on c.id = rt.campaign_id
  where rt.id = p_thread_id;

  if not found then
    return false;
  end if;

  -- Check if handoff is enabled
  if v_thread.handoff_mode is null or v_thread.handoff_mode = 'none' then
    return false;
  end if;

  if v_thread.handoff_destination is null or v_thread.handoff_destination = 'none' then
    return false;
  end if;

  -- Check handoff conditions
  -- Trigger if:
  -- 1. Opportunity score >= 7
  -- 2. Category is 'interested' or 'meeting'
  if (v_thread.ai_opportunity_score >= 7) or
     (v_thread.ai_category in ('interested', 'meeting')) then
    return true;
  end if;

  return false;
end;
$$;

-- Function to log handoff attempt (called from application code)
create or replace function public.log_handoff_attempt(
  p_account_id uuid,
  p_lead_id uuid,
  p_company_id uuid,
  p_campaign_id uuid,
  p_method text,
  p_status text,
  p_meta jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_log_id uuid;
begin
  insert into public.handoff_logs (
    account_id,
    lead_id,
    company_id,
    campaign_id,
    method,
    status,
    meta
  )
  values (
    p_account_id,
    p_lead_id,
    p_company_id,
    p_campaign_id,
    p_method,
    p_status,
    p_meta
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- Comment
comment on function public.should_trigger_handoff is 'Checks if a thread meets handoff conditions based on opportunity score and category';
comment on function public.log_handoff_attempt is 'Logs a handoff attempt to handoff_logs table';












