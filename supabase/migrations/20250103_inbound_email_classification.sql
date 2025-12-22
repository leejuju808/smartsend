-- A) Message flags
alter table public.inbox_messages
  add column if not exists is_human boolean default true,
  add column if not exists provider_thread_id text,             -- optional: vendor thread id
  add column if not exists provider_message_id text;            -- optional: vendor message id

create index if not exists idx_msgs_is_human on public.inbox_messages(is_human);
create index if not exists idx_msgs_provider_thread on public.inbox_messages(provider_thread_id);

-- B) Backfill is_human from existing ai_label (if Block 2 already tagging)
update public.inbox_messages
set is_human = case
  when coalesce(ai_label,'') in ('ooo','unsubscribe','bounce') then false
  else true
end
where is_human is distinct from case
  when coalesce(ai_label,'') in ('ooo','unsubscribe','bounce') then false
  else true
end;

-- C) Harden the trigger to ONLY act on human inbound
create or replace function public.tg_on_inbound_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canceled int;
  v_stop boolean;
begin
  if new.direction = 'in' and coalesce(new.is_human, true) = true then
    select coalesce(c.stop_on_reply, true)
      into v_stop
    from public.inbox_threads t
    join public.campaigns c on c.id = t.campaign_id
    where t.id = new.thread_id;

    if v_stop then
      update public.inbox_threads
         set replied_at = coalesce(replied_at, new.sent_at),
             stopped_by_reply = true
       where id = new.thread_id;

      v_canceled := public.cancel_future_queue_for_thread(new.thread_id);

      insert into public.audit_logs(campaign_id, thread_id, action, meta)
      select t.campaign_id, t.id, 'auto.cancel_followups',
             jsonb_build_object('canceled', v_canceled)
      from public.inbox_threads t
      where t.id = new.thread_id;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists tr_on_inbound_reply on public.inbox_messages;
create trigger tr_on_inbound_reply
after insert on public.inbox_messages
for each row execute function public.tg_on_inbound_reply();

-- D) Permissions (functions run as definer; still expose for clarity)
grant execute on function public.tg_on_inbound_reply() to anon, authenticated, service_role;

-- E) RLS policies for service_role inserts
drop policy if exists ins_msgs_srv on public.inbox_messages;
create policy ins_msgs_srv on public.inbox_messages
  for insert to service_role
  using (true)
  with check (true);

drop policy if exists ins_threads_srv on public.inbox_threads;
create policy ins_threads_srv on public.inbox_threads
  for insert to service_role
  using (true)
  with check (true);

-- F) Safety saves telemetry view
create or replace view public.v_safety_saves as
select
  date_trunc('day', created_at)::date as day,
  campaign_id,
  count(*) as cancels
from public.audit_logs
where action = 'auto.cancel_followups'
group by 1,2;





