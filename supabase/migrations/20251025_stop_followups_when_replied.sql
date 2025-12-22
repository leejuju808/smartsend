-- Ensure common statuses
do $$ begin
  if not exists (
    select 1 from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    where t.typname = 'lead_status'
  ) then
    create type lead_status as enum ('new','queued','sent','replied','bounced','paused');
  end if;
end $$;

alter table if exists public.leads
  alter column status type lead_status using status::lead_status;

-- Optional: queue table shape (adjust if you already have it)
-- id uuid pk, lead_id uuid fk, campaign_id uuid fk, scheduled_at timestamptz, status text, last_error text
-- status: 'pending' | 'processing' | 'sent' | 'canceled' | 'skipped' | 'failed'
create index if not exists idx_send_queue_pending_due
  on public.send_queue (scheduled_at)
  where status = 'pending';

-- Function: when a lead flips to replied, cancel all future pending sends
create or replace function public.cancel_future_sends_on_reply()
returns trigger language plpgsql as $$
begin
  -- Only act on transitions to replied
  if (tg_op = 'UPDATE' and new.status = 'replied' and old.status is distinct from 'replied') then
    update public.send_queue sq
       set status = 'canceled',
           last_error = 'Auto-canceled because lead replied at ' || coalesce(new.replied_at, now())::text
     where sq.lead_id = new.id
       and sq.status = 'pending'
       and sq.scheduled_at > now();
  end if;
  return new;
end $$;

drop trigger if exists trg_cancel_future_sends_on_reply on public.leads;
create trigger trg_cancel_future_sends_on_reply
after update of status, replied_at on public.leads
for each row execute function public.cancel_future_sends_on_reply();