-- A) Thread hardening

alter table public.inbox_threads
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists replied_at timestamptz,
  add column if not exists stopped_by_reply boolean default false;

create index if not exists idx_threads_campaign_lead on public.inbox_threads(campaign_id, lead_id);
create index if not exists idx_threads_replied_at on public.inbox_threads(replied_at);

-- B) Queue: add thread + cancel reason

alter table public.send_queue
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete set null,
  add column if not exists cancel_reason text;

create index if not exists idx_sq_thread on public.send_queue(thread_id);
create index if not exists idx_sq_status_sched on public.send_queue(status, scheduled_at);

-- C) Helper: cancel future queue for a thread

create or replace function public.cancel_future_queue_for_thread(p_thread uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_lead uuid;
  v_count int := 0;
begin
  select campaign_id, lead_id
    into v_campaign, v_lead
  from public.inbox_threads
  where id = p_thread;

  if v_campaign is null or v_lead is null then
    return 0;
  end if;

  update public.send_queue
     set status = 'canceled',
         cancel_reason = coalesce(cancel_reason,'stopped_by_reply'),
         updated_at = now()
   where campaign_id = v_campaign
     and lead_id = v_lead
     and status in ('queued','sending')
  returning 1
   into v_count;

  -- optional: log a cancel entry per item (if send_logs table exists and has required columns)
  -- Try to insert into send_logs for canceled items, but don't fail if schema doesn't match
  begin
    insert into public.send_logs (queue_id, campaign_id, account_id, lead_id, status, error, to_email)
    select q.id, q.campaign_id, 
           coalesce(q.account_id, q.mailbox_id) as account_id,
           q.lead_id, 'failed', 'canceled_by_reply', 
           coalesce((select email from public.leads where id = q.lead_id limit 1), 'unknown') as to_email
    from public.send_queue q
    where q.campaign_id = v_campaign
      and q.lead_id = v_lead
      and q.status = 'canceled'
      and q.updated_at >= now() - interval '5 seconds';
  exception when others then
    -- Schema mismatch - skip logging, but continue
    null;
  end;

  return (select count(*) from public.send_queue
          where campaign_id=v_campaign and lead_id=v_lead and status='canceled'
            and updated_at >= now() - interval '5 seconds');
end $$;

-- D) One-call helper: mark reply & stop

create or replace function public.mark_reply_and_stop(p_thread uuid, p_at timestamptz default now())
returns int
language plpgsql
security definer
set search_path=public
as $$
declare
  v int;
begin
  update public.inbox_threads
     set replied_at = coalesce(replied_at, p_at),
         stopped_by_reply = true
   where id = p_thread;

  select public.cancel_future_queue_for_thread(p_thread) into v;
  return v;
end $$;

-- E) Trigger: if replied_at flips from null → value, auto-cancel

create or replace function public.trg_threads_stop_on_reply()
returns trigger
language plpgsql
as $$
begin
  if (TG_OP = 'UPDATE') and (NEW.replied_at is not null) and (OLD.replied_at is null) then
    perform public.cancel_future_queue_for_thread(NEW.id);
  end if;
  return NEW;
end $$;

drop trigger if exists trg_threads_stop_on_reply on public.inbox_threads;
create trigger trg_threads_stop_on_reply
after update on public.inbox_threads
for each row execute function public.trg_threads_stop_on_reply();

