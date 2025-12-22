-- A) Safety: campaign_members (enrollment) if you don't already have it

create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique (campaign_id, lead_id)
);

create index if not exists idx_cm_campaign on public.campaign_members(campaign_id);
create index if not exists idx_cm_lead on public.campaign_members(lead_id);

-- B) send_queue status enum + uniqueness (if not already present)

do $$ begin
  if not exists (select 1 from pg_type where typname = 'queue_status') then
    create type public.queue_status as enum ('queued','dispatched','sent','failed','canceled');
  end if;
end $$;

-- Ensure send_queue has the required columns and uses queue_status enum
do $$ begin
  -- Add scheduled_for if it doesn't exist (may be scheduled_at)
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'send_queue' and column_name = 'scheduled_for') then
    if exists (select 1 from information_schema.columns 
               where table_schema = 'public' and table_name = 'send_queue' and column_name = 'scheduled_at') then
      alter table public.send_queue rename column scheduled_at to scheduled_for;
    else
      alter table public.send_queue add column scheduled_for timestamptz not null default now();
    end if;
  end if;

  -- Ensure account_id exists (may be mailbox_id)
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'send_queue' and column_name = 'account_id') then
    if exists (select 1 from information_schema.columns 
               where table_schema = 'public' and table_name = 'send_queue' and column_name = 'mailbox_id') then
      alter table public.send_queue rename column mailbox_id to account_id;
    else
      alter table public.send_queue add column account_id uuid references public.connected_accounts(id) on delete cascade;
    end if;
  end if;

  -- Ensure step_no exists
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'send_queue' and column_name = 'step_no') then
    alter table public.send_queue add column step_no int not null default 1 check (step_no >= 1);
  end if;

  -- Update status column to use enum if it exists as text
  if exists (select 1 from information_schema.columns 
             where table_schema = 'public' and table_name = 'send_queue' and column_name = 'status'
             and data_type = 'text') then
    -- We'll keep text status but ensure it matches enum values
    -- The unique constraint will be added below
  end if;
end $$;

-- Add unique constraint for (campaign_id, lead_id, step_no) if not exists
do $$ begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'send_queue_campaign_lead_step_unique'
  ) then
    -- Drop old unique constraints that might conflict
    alter table public.send_queue drop constraint if exists uq_sq_campaign_lead_step;
    alter table public.send_queue drop constraint if exists uq_sq_campaign_lead;
    -- Add new unique constraint
    alter table public.send_queue add constraint send_queue_campaign_lead_step_unique 
      unique (campaign_id, lead_id, step_no);
  end if;
end $$;

create index if not exists idx_sq_status_time on public.send_queue(status, scheduled_for);
create index if not exists idx_sq_account_time on public.send_queue(account_id, scheduled_for);

-- Ensure campaigns has account_id and owner_id (adapt to existing schema)
do $$ begin
  -- Add account_id if missing
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'campaigns' and column_name = 'account_id') then
    alter table public.campaigns add column account_id uuid references public.connected_accounts(id) on delete set null;
  end if;

  -- Add owner_id if missing (use user_id as fallback in functions)
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'campaigns' and column_name = 'owner_id') then
    alter table public.campaigns add column owner_id uuid references auth.users(id) on delete cascade;
    -- Backfill from user_id if it exists
    if exists (select 1 from information_schema.columns 
               where table_schema = 'public' and table_name = 'campaigns' and column_name = 'user_id') then
      update public.campaigns set owner_id = user_id where owner_id is null;
    end if;
  end if;
end $$;

-- C) Helper: last sent step/time per (campaign, lead)
create or replace view public.v_last_sent_per_lead as
select
  sl.campaign_id,
  sl.lead_id,
  max(sl.step_no) as last_step_no,
  max(coalesce(sl.sent_at, sl.created_at)) filter (where sl.status = 'sent') as last_sent_at
from public.send_logs sl
where sl.campaign_id is not null and sl.lead_id is not null
group by 1,2;

-- D) Helper: account capacity remaining for "today" (per mailbox)
--    Counts both already sent and already queued for today.
create or replace function public.account_capacity_remaining(p_account uuid)
returns int
language sql stable as $$
  with a as (
    select coalesce(daily_cap, 40) as cap
    from public.connected_accounts
    where id = p_account
  ),
  usage_sent as (
    select count(*)::int as n
    from public.send_logs
    where (account_id = p_account or mailbox_id = p_account)
      and (sent_at >= date_trunc('day', now()) or created_at >= date_trunc('day', now()))
      and status = 'sent'
  ),
  usage_queued as (
    select count(*)::int as n
    from public.send_queue
    where account_id = p_account
      and status in ('queued','dispatched')
      and scheduled_for >= date_trunc('day', now())
      and scheduled_for < date_trunc('day', now()) + interval '1 day'
  )
  select greatest( (select cap from a) - ((select n from usage_sent) + (select n from usage_queued)), 0 );
$$;

-- E) Compute the next due (step_no, scheduled_for) for a lead
create or replace function public.compute_next_due_for_lead(
  p_campaign uuid,
  p_lead uuid,
  p_now timestamptz default now()
)
returns table(step_no int, scheduled_for timestamptz, account_id uuid)
language plpgsql stable
set search_path = public
as $$
declare
  v_account uuid;
  v_last_step int;
  v_last_sent timestamptz;
  v_enrolled timestamptz;
  v_next_step int;
  v_offset_days int;
  v_step_id uuid;
  v_base timestamptz;
  v_sched timestamptz;
begin
  -- Get account_id from campaigns (prefer account_id, fallback to user_id lookup)
  select c.account_id, coalesce(c.account_id, 
    (select ca.id from public.connected_accounts ca where ca.user_id = c.user_id limit 1)
  ) into v_account
  from public.campaigns c
  where c.id = p_campaign;

  if v_account is null then
    return;
  end if;

  select enrolled_at into v_enrolled
  from public.campaign_members
  where campaign_id = p_campaign and lead_id = p_lead;

  select l.last_step_no, l.last_sent_at
    into v_last_step, v_last_sent
  from public.v_last_sent_per_lead l
  where l.campaign_id = p_campaign and l.lead_id = p_lead;

  -- decide next step
  v_next_step := coalesce(v_last_step, 0) + 1;

  -- only if step exists and enabled
  select id, offset_days into v_step_id, v_offset_days
  from public.campaign_steps
  where campaign_id = p_campaign and step_no = v_next_step and enabled
  limit 1;

  if not found then return; end if;

  -- base = max(enrolled_at, last_sent_at, now()) for sequencing
  v_base := greatest(coalesce(v_last_sent, '-infinity'::timestamptz),
                     coalesce(v_enrolled, p_now),
                     p_now);

  v_base := v_base + (v_offset_days || ' days')::interval;

  -- window + tz clamp using your existing function
  v_sched := public.business_windowed_send_time_for_step(v_account, v_base, v_step_id);

  step_no := v_next_step;
  scheduled_for := v_sched;
  account_id := v_account;
  return next;
end;
$$;

-- F) Enqueue due sends for a campaign (respects reply-stops and capacity)
create or replace function public.enqueue_due_for_campaign(
  p_campaign uuid,
  p_now timestamptz default now(),
  p_batch_limit int default 200
)
returns table(enqueued int, account_remaining int)
language plpgsql security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_cap int;
  v_done int := 0;
  r record;
  -- Usage tracking variables
  v_billing_account uuid;
  v_usage_ok boolean;
  v_today_total int;
  v_soft int;
  v_hard int;
  v_breach text;
begin
  -- Get account_id from campaigns
  select coalesce(c.account_id, 
    (select ca.id from public.connected_accounts ca where ca.user_id = c.user_id limit 1)
  ) into v_account
  from public.campaigns c
  where c.id = p_campaign;

  if v_account is null then
    return query select 0, 0;
  end if;

  -- Get billing account for campaign
  v_billing_account := public.billing_account_for_campaign(p_campaign);

  -- Check usage limits (dry run, no commit)
  if v_billing_account is not null then
    select ok, total_today, soft_cap, hard_cap, breach
      into v_usage_ok, v_today_total, v_soft, v_hard, v_breach
    from public.check_and_add_usage(v_billing_account, 'enqueue_checks', 0, true, false);

    -- Get current emails_sent today
    select coalesce(qty,0) into v_today_total
    from public.billing_usage
    where account_id = v_billing_account
      and day = current_date 
      and metric = 'emails_sent';

    -- Enforce hard cap: clamp by remaining allowance
    v_cap := public.account_capacity_remaining(v_account);
    if v_hard is not null and v_today_total < v_hard then
      v_cap := least(v_cap, greatest(v_hard - v_today_total, 0));
    end if;
  else
    v_cap := public.account_capacity_remaining(v_account);
  end if;

  if v_cap <= 0 then
    return query select 0, 0;
  end if;

  for r in
    with base as (
      select cm.lead_id
      from public.campaign_members cm
      left join public.inbox_threads t
        on t.campaign_id = cm.campaign_id and t.lead_id = cm.lead_id
      left join public.leads l
        on l.id = cm.lead_id
      where cm.campaign_id = p_campaign
        and coalesce(t.stopped_by_reply, false) = false
        and not exists (
          select 1 from public.leads ll
          where ll.id = cm.lead_id and ll.suppressed = true
        )
    ),
    due as (
      select
        b.lead_id,
        (select d.step_no from public.compute_next_due_for_lead(p_campaign, b.lead_id, p_now) d limit 1) as step_no,
        (select d.scheduled_for from public.compute_next_due_for_lead(p_campaign, b.lead_id, p_now) d limit 1) as scheduled_for,
        (select d.account_id from public.compute_next_due_for_lead(p_campaign, b.lead_id, p_now) d limit 1) as account_id
      from base b
    )
    select * from due
    where step_no is not null
      and scheduled_for <= p_now
    order by scheduled_for asc
    limit least(p_batch_limit, v_cap)
  loop
    begin
      insert into public.send_queue (campaign_id, account_id, lead_id, step_no, scheduled_for, status)
      values (p_campaign, r.account_id, r.lead_id, r.step_no, r.scheduled_for, 'queued')
      on conflict (campaign_id, lead_id, step_no) do nothing;

      if found then
        v_done := v_done + 1;
      end if;
    exception when others then
      -- ignore per-row errors, keep enqueuing
      continue;
    end;
  end loop;

  return query select v_done, public.account_capacity_remaining(v_account);
end;
$$;

-- G) (Optional) RLS – let only service role insert into queue; owners can read their own campaign queue
alter table public.send_queue enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='send_queue' and policyname='Send queue read own') then
    create policy "Send queue read own"
    on public.send_queue for select
    using (exists (
      select 1 from public.campaigns c 
      where c.id = send_queue.campaign_id 
      and (c.owner_id = auth.uid() or c.user_id = auth.uid())
    ));
  end if;
end $$;
-- (Writes happen from edge function with service role)

-- H) Pop a batch of due items atomically
create or replace function public.pop_due_queue_batch(p_limit int default 25)
returns table(id uuid, campaign_id uuid, account_id uuid, lead_id uuid, step_no int)
language sql security definer
as $$
  with cte as (
    select id
    from public.send_queue
    where status = 'queued'
      and scheduled_for <= now()
    order by scheduled_for asc
    limit p_limit
    for update skip locked
  ), upd as (
    update public.send_queue sq
    set status = 'dispatched'
    where id in (select id from cte)
    returning sq.id, sq.campaign_id, sq.account_id, sq.lead_id, sq.step_no
  )
  select * from upd;
$$;

