-- Mailbox Daily Cap System
-- Wire mailbox → queue, usage view, helpers

-- A) Ensure each queue row knows which mailbox (connected account) will send it
alter table public.send_queue
  add column if not exists account_id uuid references public.connected_accounts(id);

create index if not exists idx_queue_account_day
  on public.send_queue(account_id, scheduled_at);

-- B) Today's mailbox usage (sent count)
create or replace view public.v_mailbox_usage_today as
select
  q.account_id,
  current_date as day,
  count(*)::int as sent_count
from public.send_queue q
where q.status = 'sent'
  and q.sent_at >= date_trunc('day', now())
group by 1;

-- C) Remaining sends helper: connected_accounts.daily_cap - sent today
create or replace function public.account_remaining_sends(p_account uuid)
returns int
language sql
stable
as $$
  with cap as (
    select coalesce(daily_cap, 40)::int as cap
    from public.connected_accounts
    where id = p_account
  ),
  used as (
    select coalesce(v.sent_count, 0)::int as used
    from cap
    left join public.v_mailbox_usage_today v on true and v.account_id = p_account
  )
  select greatest((select cap from cap) - (select used from used), 0);
$$;

grant execute on function public.account_remaining_sends(uuid) to anon, authenticated, service_role;

-- D) Deferral helper: push a queue row to tomorrow 09:00 (server time)
create or replace function public.defer_to_tomorrow_morning(p_queue uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_when timestamptz := date_trunc('day', now() + interval '1 day') + time '09:00';
begin
  update public.send_queue
     set status = 'pending',
         updated_at = now(),
         scheduled_at = v_when,
         error = coalesce(error,'') || ' [deferred: daily_cap]'
   where id = p_queue;

  return v_when;
end
$$;

grant execute on function public.defer_to_tomorrow_morning(uuid) to anon, authenticated, service_role;

-- E) Ensure sent_at column exists on send_queue (for tracking when emails were sent)
alter table public.send_queue
  add column if not exists sent_at timestamptz;

-- F) Ensure error column exists (may be named last_error in some schemas)
do $$
begin
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'error') then
    alter table public.send_queue add column error text;
  end if;
end $$;

-- G) Backfill account_id from mailbox_id for existing rows (if mailbox_id exists)
update public.send_queue
  set account_id = mailbox_id
  where account_id is null and mailbox_id is not null;

-- H) Ensure audit_logs supports the auto.defer_daily_cap action
alter table public.audit_logs
  drop constraint if exists audit_logs_action_check;

alter table public.audit_logs
  add constraint audit_logs_action_check check (action in (
    'share.add', 'share.update', 'share.remove',
    'invite.create', 'invite.accept', 'invite.expire',
    'auto.defer_daily_cap',
    'user.bulk_close', 'user.bulk_reopen', 'user.bulk_assign',
    'user.bulk_clear_label', 'user.bulk_apply_label',
    'auto.cancel_followups'
  ));
