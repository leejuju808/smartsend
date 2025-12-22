-- Inbox QoL helpers for handled/pinned threads and lightweight overview views

-- A) Inbox QoL columns (idempotent)
alter table public.inbox_threads
  add column if not exists handled boolean not null default false,
  add column if not exists pinned boolean not null default false;

create index if not exists idx_threads_handled on public.inbox_threads(handled, updated_at desc);
create index if not exists idx_threads_pinned on public.inbox_threads(pinned desc, updated_at desc);


-- B) Surface last inbound snapshots
create or replace view public.v_thread_last_inbound as
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  max(m.created_at) as last_inbound_at,
  (array_agg(m.ai_label order by m.created_at desc))[1] as last_inbound_label
from public.inbox_threads t
join public.inbox_messages m on m.thread_id = t.id and m.direction = 'inbound'
group by 1,2,3;

grant select on public.v_thread_last_inbound to authenticated;


-- C) Overview view for UI (threads + leads + last inbound)
create or replace view public.v_inbox_overview as
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  t.provider,
  t.provider_thread_id,
  t.muted,
  t.pinned,
  t.handled,
  t.replied_at,
  t.updated_at,
  l.email as lead_email,
  l.bounced as lead_bounced,
  l.unsubscribed as lead_unsubscribed,
  l.last_bounce_reason,
  v.last_inbound_at
from public.inbox_threads t
left join public.leads l on l.id = t.lead_id
left join public.v_thread_last_inbound v on v.thread_id = t.id;

grant select on public.v_inbox_overview to authenticated;


-- D) RPC helpers for quick actions
create or replace function public.inbox_mark_handled(p_thread uuid, p_handled boolean)
returns void
language sql
security definer
set search_path=public
as $$
  update public.inbox_threads set handled = p_handled, updated_at = now()
  where id = p_thread;
$$;

grant execute on function public.inbox_mark_handled(uuid, boolean) to authenticated;
revoke all on function public.inbox_mark_handled(uuid, boolean) from anon;


create or replace function public.inbox_pin(p_thread uuid, p_pinned boolean)
returns void
language sql
security definer
set search_path=public
as $$
  update public.inbox_threads set pinned = p_pinned, updated_at = now()
  where id = p_thread;
$$;

grant execute on function public.inbox_pin(uuid, boolean) to authenticated;
revoke all on function public.inbox_pin(uuid, boolean) from anon;


