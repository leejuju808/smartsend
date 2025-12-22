-- Queue hardening & dequeue RPC updates

-- A) Campaigns: track connected account for sending
alter table public.campaigns
  add column if not exists account_id uuid references public.connected_accounts(id) on delete set null;

create index if not exists idx_campaigns_account on public.campaigns(account_id);

-- B) Send queue operational columns
alter table public.send_queue
  add column if not exists status text not null default 'queued' check (status in ('queued','sending','sent','failed')),
  add column if not exists attempts int not null default 0,
  add column if not exists last_error text,
  add column if not exists send_after timestamptz,
  add column if not exists picked_at timestamptz,
  add column if not exists picked_by text;

create index if not exists idx_squeue_ready on public.send_queue(status, send_after);

-- C) Per-account rate bucket
create table if not exists public.send_rate (
  account_id uuid primary key references public.connected_accounts(id) on delete cascade,
  min_seconds_between int not null default 12,
  last_sent_at timestamptz
);

-- D) View of ready-to-send items
create or replace view public.v_send_ready as
select q.id, q.campaign_id, q.lead_id, q.thread_id, q.subject, q.body_html, coalesce(q.send_after, q.not_before) as ready_at
from public.send_queue q
where q.status = 'queued'
  and coalesce(q.send_after, q.not_before, now()) <= now();

-- Helper RPC to list accounts with queued jobs (optional path for worker)
create or replace function public.scan_accounts_with_queue()
returns table(account_id uuid, provider text)
language sql
security definer
set search_path = public
as $$
  select distinct c.account_id, coalesce(ca.provider, 'gmail') as provider
  from public.send_queue q
  join public.campaigns c on c.id = q.campaign_id
  left join public.connected_accounts ca on ca.id = c.account_id
  where q.status = 'queued'
    and coalesce(q.send_after, q.not_before, now()) <= now()
    and c.account_id is not null;
$$;

grant execute on function public.scan_accounts_with_queue() to authenticated, service_role;

-- E) Dequeue RPC with SKIP LOCKED & rate gating
create or replace function public.dequeue_send_job(p_worker text, p_account uuid, p_backoff_seconds int default 5)
returns table(
  id uuid, campaign_id uuid, lead_id uuid, thread_id uuid,
  subject text, body_html text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  can_at timestamptz;
begin
  select case
           when sr.last_sent_at is null then now()
           else sr.last_sent_at + make_interval(secs => sr.min_seconds_between)
         end
    into can_at
  from public.send_rate sr
  where sr.account_id = p_account;

  if can_at is not null and can_at > now() then
    return;
  end if;

  return query
  with next_job as (
    select q.*
    from public.send_queue q
    join public.campaigns c on c.id = q.campaign_id
    where q.status = 'queued'
      and coalesce(q.send_after, q.not_before, now()) <= now()
      and c.account_id = p_account
    order by q.priority desc nulls last,
             coalesce(q.send_after, q.not_before) nulls last,
             q.created_at
    for update skip locked
    limit 1
  ), updated as (
    update public.send_queue x
      set status = 'sending',
          picked_at = now(),
          picked_by = p_worker
    where x.id in (select id from next_job)
    returning x.*
  )
  select id, campaign_id, lead_id, thread_id, subject, body_html
  from updated;
end;
$$;

grant execute on function public.dequeue_send_job(text, uuid, int) to authenticated, service_role;

-- F) Mark result RPCs
create or replace function public.complete_send_job(p_id uuid, p_account uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.send_queue
     set status = 'sent'
   where id = p_id;

  insert into public.send_rate(account_id, last_sent_at)
    values (p_account, now())
  on conflict (account_id)
    do update set last_sent_at = excluded.last_sent_at;
end;
$$;

grant execute on function public.complete_send_job(uuid, uuid) to authenticated, service_role;

create or replace function public.fail_send_job(p_id uuid, p_err text, p_retry_seconds int default 60)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.send_queue
     set status = 'queued',
         attempts = attempts + 1,
         last_error = p_err,
         send_after = now() + make_interval(secs => p_retry_seconds)
   where id = p_id;
end;
$$;

grant execute on function public.fail_send_job(uuid, text, int) to authenticated, service_role;



