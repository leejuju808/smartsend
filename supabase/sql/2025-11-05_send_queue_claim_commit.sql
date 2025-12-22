-- 1) SQL — Queue table (harden) + claim/commit helpers

-- Run in Supabase SQL editor if preferred. This file mirrors those statements.

-- A) Ensure send_queue exists & is hardened
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,

  step_no int not null check (step_no >= 1),
  scheduled_for timestamptz not null,

  subject text,
  body_html text,

  status text not null default 'queued' check (status in ('queued','sending','sent','failed','canceled')),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  provider_msg_id text
);

create index if not exists idx_send_queue_due on public.send_queue(status, scheduled_for);
create index if not exists idx_send_queue_account on public.send_queue(account_id);

-- B) Fast "today" count helper for caps
create or replace function public.account_sends_today(p_account uuid)
returns integer
language sql stable as $$
  select count(*)::int
  from public.send_logs s
  where s.account_id = p_account
    and s.status = 'sent'
    and s.created_at::date = (now() at time zone 'utc')::date
$$;

-- C) Claim due rows safely (FIFO within account), skip-locked
--    Only grabs rows that are due and not over the account's daily cap.
create or replace function public.claim_send_batch(p_worker text, p_batch int default 20)
returns setof public.send_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  with due as (
    select q.id
    from public.send_queue q
    join public.connected_accounts a on a.id = q.account_id
    where q.status = 'queued'
      and q.scheduled_for <= now()
      -- allow if under cap
      and public.account_sends_today(q.account_id) < coalesce(a.daily_cap, 40)
    order by q.scheduled_for asc
    limit p_batch
    for update skip locked
  )
  update public.send_queue q
     set status = 'sending',
         locked_at = now(),
         locked_by = p_worker,
         updated_at = now()
    where q.id in (select id from due)
  returning q.id into v_ids;

  return query
  select *
  from public.send_queue
  where id = any(v_ids);
end;
$$;

-- D) Commit result helper (writes send_logs and advances status)
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
begin
  select * into r from public.send_queue where id = p_queue_id for update;
  if not found then
    raise exception 'queue row not found';
  end if;

  -- Write log row
  insert into public.send_logs(
    campaign_id, account_id, thread_id, lead_id,
    step_no, status, provider_msg_id, error_message
  ) values (
    r.campaign_id, r.account_id, null, r.lead_id,
    r.step_no, case when p_ok then 'sent' else 'failed' end,
    p_provider_msg_id, p_error
  );

  -- Update queue status
  update public.send_queue
     set status = case when p_ok then 'sent' else 'failed' end,
         provider_msg_id = coalesce(p_provider_msg_id, provider_msg_id),
         last_error = p_error,
         updated_at = now()
   where id = p_queue_id;

  -- If sent, the send_logs trigger you added earlier will auto-enqueue the next step.
end;
$$;

-- (Optional) If you have RLS on these tables, ensure service role or these functions run as SECURITY DEFINER


