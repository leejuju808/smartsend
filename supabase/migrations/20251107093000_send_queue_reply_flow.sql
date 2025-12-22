-- Queue + helpers for reply sending workflow (idempotent)

-- A) Queue --------------------------------------------------------------
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','working','done','failed','dead','skipped')),
  attempts int not null default 0,

  draft_id uuid references public.reply_drafts(id) on delete set null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,

  priority int not null default 5,
  kind text not null default 'reply',
  last_error text
);

create index if not exists idx_sq_status_run on public.send_queue(status, run_at, priority);
create index if not exists idx_sq_thread on public.send_queue(thread_id);

alter table public.send_queue enable row level security;
drop policy if exists "sq_ro" on public.send_queue;
create policy "sq_ro" on public.send_queue for select to authenticated using (false);


-- B) Per-account rate budgets ------------------------------------------
create table if not exists public.send_rate_budgets (
  account_id uuid primary key references public.connected_accounts(id) on delete cascade,
  daily_quota int not null default 1800,
  hourly_quota int not null default 200,
  burst int not null default 20,
  last_reset timestamptz not null default now()
);


-- C) Lightweight attempts log ------------------------------------------
create table if not exists public.send_attempts (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  queue_id uuid not null references public.send_queue(id) on delete cascade,
  provider text,
  account_id uuid,
  result text,
  status_code int,
  message text
);

create index if not exists idx_send_attempts_queue on public.send_attempts(queue_id);


-- D) Claim helper -------------------------------------------------------
drop function if exists public.claim_send_queue(text, int);

create or replace function public.claim_send_queue(p_limit int default 25)
returns setof public.send_queue
language sql
security definer
set search_path = public
as $$
  with c as (
    select id
    from public.send_queue
    where status = 'queued'
      and run_at <= now()
    order by priority asc, run_at asc
    limit p_limit
    for update skip locked
  )
  update public.send_queue t
     set status = 'working',
         attempts = t.attempts + 1
   where t.id in (select id from c)
  returning t.*;
$$;

revoke all on function public.claim_send_queue(int) from public;
grant execute on function public.claim_send_queue(int) to authenticated;


-- E) Thread account helper ---------------------------------------------
alter table public.inbox_threads
  add column if not exists account_id uuid references public.connected_accounts(id) on delete set null;

create index if not exists idx_threads_account on public.inbox_threads(account_id);


-- F) Outcome helper -----------------------------------------------------
create or replace function public.finish_send(queue uuid, ok boolean, err text default null, delay_minutes int default null)
returns void
language plpgsql
security definer
as $$
declare
  v_attempts int;
begin
  select attempts into v_attempts from public.send_queue where id = queue;

  if ok then
    update public.send_queue
       set status = 'done',
           last_error = null
     where id = queue;
  else
    update public.send_queue
       set status = case when coalesce(v_attempts, 0) >= 5 then 'dead' else 'failed' end,
           last_error = err,
           run_at = case
             when delay_minutes is null then run_at
             else now() + make_interval(mins => delay_minutes)
           end
     where id = queue;
  end if;
end;
$$;


-- G) Draft + thread markers --------------------------------------------
create or replace function public.tg_mark_sent_on_done()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'done' and new.draft_id is not null then
    update public.reply_drafts
       set status = 'sent',
           sent_at = now()
     where id = new.draft_id;

    update public.inbox_threads
       set needs_reply = false
     where id = new.thread_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mark_sent_on_done on public.send_queue;

create trigger trg_mark_sent_on_done
after update of status on public.send_queue
for each row
when (new.status = 'done')
execute procedure public.tg_mark_sent_on_done();


