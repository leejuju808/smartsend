-- 1) Thread-level AI auto-pause fields
alter table public.inbox_threads
  add column if not exists ai_return_date date,
  add column if not exists auto_paused_reason text,
  add column if not exists auto_paused_until timestamptz;

create index if not exists idx_threads_auto_paused_until
  on public.inbox_threads(auto_paused_until);

-- 2) Business day adder helper (weekdays only)
create or replace function public.add_business_days(p_start timestamptz, p_days int)
returns timestamptz
language plpgsql immutable
set search_path = public
as $$
declare
  d int := 0;
  cur timestamptz := p_start;
begin
  if p_days <= 0 then
    return p_start;
  end if;

  while d < p_days loop
    cur := cur + interval '1 day';
    if extract(isodow from cur)::int between 1 and 5 then
      d := d + 1;
    end if;
  end loop;

  return cur;
end;
$$;

-- 3) Pause helper RPC (security definer)
create or replace function public.pause_lead_followups(
  p_thread_id uuid,
  p_reason text default 'ooo',
  p_until timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_campaign_id uuid;
begin
  select lead_id, campaign_id into v_lead_id, v_campaign_id
  from public.inbox_threads
  where id = p_thread_id;

  if v_lead_id is null then
    return;
  end if;

  update public.followup_tasks
     set paused = true,
         paused_at = now(),
         resumed_at = null
   where lead_id = v_lead_id
     and done = false;

  if v_campaign_id is not null then
    update public.campaign_leads
       set paused_at = now(),
           pause_reason = p_reason,
           paused_until = p_until
     where campaign_id = v_campaign_id
       and lead_id = v_lead_id;
  end if;

  update public.inbox_threads
     set auto_paused_reason = p_reason,
         auto_paused_until  = p_until,
         paused_reason      = p_reason,
         paused_until       = p_until,
         paused_by_system   = true
   where id = p_thread_id;
end;
$$;

-- 4) Resume helper RPC (security definer)
create or replace function public.resume_lead_followups(
  p_thread_id uuid,
  p_reason text default 'manual'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_campaign_id uuid;
begin
  select lead_id, campaign_id into v_lead_id, v_campaign_id
  from public.inbox_threads
  where id = p_thread_id;

  if v_lead_id is null then
    return;
  end if;

  update public.followup_tasks
     set paused = false,
         resumed_at = now(),
         paused_at = null
   where lead_id = v_lead_id
     and coalesce(paused, false) = true
     and done = false;

  if v_campaign_id is not null then
    update public.campaign_leads
       set paused_at = null,
           paused_until = null,
           pause_reason = case
             when pause_reason = p_reason then null
             else pause_reason
           end
     where campaign_id = v_campaign_id
       and lead_id = v_lead_id;
  end if;

  update public.inbox_threads
     set auto_paused_reason = null,
         auto_paused_until  = null,
         paused_reason      = case when paused_by_system then null else paused_reason end,
         paused_until       = case when paused_by_system then null else paused_until end,
         paused_by_system   = case when paused_by_system then false else paused_by_system end
   where id = p_thread_id;

  insert into public.system_logs(category, level, message, meta)
  values (
    'resume',
    'info',
    'followups resumed',
    jsonb_build_object('thread_id', p_thread_id, 'reason', p_reason)
  );
end;
$$;

