-- Queue retry/cancel RPCs, status enum, indexes, and view for dashboard

-- 1) Status enum (idempotent)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'queue_status') then
    create type queue_status as enum ('queued','sending','sent','failed','canceled');
  end if;
end $$;

-- 2) Ensure send_queue has required columns and types (best-effort, idempotent)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'attempt_count'
  ) then
    alter table public.send_queue add column attempt_count int not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'max_attempts'
  ) then
    alter table public.send_queue add column max_attempts int not null default 3;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'last_error'
  ) then
    alter table public.send_queue add column last_error text;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'updated_at'
  ) then
    alter table public.send_queue add column updated_at timestamptz not null default now();
  end if;
exception when undefined_table then
  -- If table does not exist in this project variation, skip quietly.
  perform 1;
end $$;

-- Try to align status type to queue_status if feasible (optional, safe)
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'status'
  ) then
    -- Only attempt cast if column is text-like
    if (select data_type from information_schema.columns where table_schema='public' and table_name='send_queue' and column_name='status') in ('text','character varying') then
      -- Ensure values fit the enum; map common synonyms
      alter table public.send_queue
      alter column status type queue_status using (
        case lower(status)
          when 'pending' then 'queued'::queue_status
          when 'scheduled' then 'queued'::queue_status
          when 'locked' then 'sending'::queue_status
          when 'sending' then 'sending'::queue_status
          when 'sent' then 'sent'::queue_status
          when 'failed' then 'failed'::queue_status
          when 'canceled' then 'canceled'::queue_status
          when 'cancelled' then 'canceled'::queue_status
          else 'queued'::queue_status
        end
      );
    end if;
  end if;
exception when undefined_table then
  perform 1;
end $$;

-- Helpful indexes
create index if not exists send_queue_ws_status_idx on public.send_queue (workspace_id, status);
create index if not exists send_queue_ws_lead_idx   on public.send_queue (workspace_id, lead_id);

-- 3) RPC: retry selected failed rows (guarded)
create or replace function public.reenqueue_failures(
  _workspace_id uuid,
  _queue_ids uuid[]
)
returns table(queued uuid, skipped uuid, reason text)
language plpgsql
security definer
as $$
declare
  r record;
begin
  for r in
    select q.id,
           (coalesce(q.attempt_count,0) < coalesce(q.max_attempts,3)) as can_retry,
           q.status,
           coalesce(q.attempt_count,0) as attempt_count,
           coalesce(q.max_attempts,3) as max_attempts
    from public.send_queue q
    where q.workspace_id = _workspace_id
      and q.id = any (_queue_ids)
  loop
    if r.status <> 'failed' then
      queued := null; skipped := r.id; reason := 'Not failed'; return next;
    elsif not r.can_retry then
      queued := null; skipped := r.id; reason := 'Max attempts reached'; return next;
    else
      update public.send_queue
         set status = 'queued',
             attempt_count = coalesce(attempt_count,0) + 1,
             last_error = null,
             updated_at = now()
       where id = r.id
       returning id into queued;
      skipped := null; reason := null;
      return next;
    end if;
  end loop;
end $$;

revoke all on function public.reenqueue_failures(uuid, uuid[]) from public;
grant execute on function public.reenqueue_failures(uuid, uuid[]) to authenticated;

-- 4) RPC to cancel selected rows
create or replace function public.cancel_queue_items(
  _workspace_id uuid,
  _queue_ids uuid[]
)
returns setof uuid
language sql
security definer
as $$
  update public.send_queue
     set status = 'canceled',
         updated_at = now()
   where workspace_id = _workspace_id
     and id = any (_queue_ids)
  returning id;
$$;

revoke all on function public.cancel_queue_items(uuid, uuid[]) from public;
grant execute on function public.cancel_queue_items(uuid, uuid[]) to authenticated;

-- 5) View for dashboard (rich join)
drop view if exists public.send_queue_view;
create or replace view public.send_queue_view as
select
  q.id,
  q.workspace_id,
  q.campaign_id,
  c.name as campaign_name,
  q.lead_id,
  l.email as lead_email,
  l.first_name,
  l.last_name,
  q.status,
  coalesce(q.attempt_count, 0) as attempt_count,
  coalesce(q.max_attempts, 3) as max_attempts,
  q.last_error,
  coalesce(q.updated_at, q.created_at) as updated_at
from public.send_queue q
left join public.leads l on l.id = q.lead_id
left join public.campaigns c on c.id = q.campaign_id;

-- Grant select on view to authenticated
grant select on public.send_queue_view to authenticated;


