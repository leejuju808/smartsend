-- Thread reply markers and helper function
alter table if exists public.inbox_threads
  add column if not exists replied_at timestamptz,
  add column if not exists replied_message_id uuid references public.inbox_messages(id) on delete set null,
  add column if not exists reply_reason text,
  add column if not exists needs_reply boolean;

create index if not exists idx_threads_replied_at on public.inbox_threads(replied_at desc);
create index if not exists idx_threads_needs_reply on public.inbox_threads(needs_reply) where needs_reply is true;

drop function if exists public.mark_thread_replied(uuid, uuid, text);
drop function if exists public.mark_thread_replied(uuid, timestamptz);

create or replace function public.mark_thread_replied(
  p_thread uuid,
  p_message uuid,
  p_reason text default 'manual'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_lead uuid;
begin
  select t.campaign_id, t.lead_id into v_campaign, v_lead
  from public.inbox_threads t
  where t.id = p_thread;

  if v_campaign is null then
    raise exception 'thread not found';
  end if;

  update public.inbox_threads
     set replied_at = coalesce(replied_at, now()),
         replied_message_id = coalesce(replied_message_id, p_message),
         reply_reason = coalesce(reply_reason, p_reason),
         needs_reply = false,
         updated_at = now()
   where id = p_thread;

  update public.campaign_leads
     set status = case when status in ('new','queued','sent','paused') then 'replied' else status end,
         meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('replied_at', now(), 'reply_reason', p_reason)
   where campaign_id = v_campaign and lead_id = v_lead;

  insert into public.delivery_events (id, created_at, campaign_id, lead_id, kind, meta)
  select gen_random_uuid(), now(), v_campaign, v_lead, 'replied',
         jsonb_build_object('thread_id', p_thread, 'message_id', p_message, 'reason', p_reason)
  where exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'delivery_events')
  on conflict do nothing;

  begin
    perform public.log_event(
      p_campaign := v_campaign,
      p_thread := p_thread,
      p_lead := v_lead,
      p_user := null,
      p_kind := 'thread_marked_replied',
      p_note := coalesce(p_reason, ''),
      p_meta := '{}'::jsonb
    );
  exception
    when undefined_function then
      null;
  end;
end;
$$;

-- Compatibility wrapper for legacy callers using timestamp-based signature.
create or replace function public.mark_thread_replied(
  p_thread uuid,
  p_at timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.mark_thread_replied(p_thread := p_thread, p_message := null, p_reason := 'manual');
  update public.inbox_threads
     set replied_at = coalesce(replied_at, p_at),
         updated_at = now()
   where id = p_thread;
end;
$$;

revoke all on function public.mark_thread_replied(uuid, uuid, text) from public;
grant execute on function public.mark_thread_replied(uuid, uuid, text) to service_role;
grant execute on function public.mark_thread_replied(uuid, timestamptz) to service_role;

alter table public.inbox_threads enable row level security;

drop policy if exists inbox_threads_read on public.inbox_threads;
create policy inbox_threads_read
on public.inbox_threads
for select
to authenticated
using (
  exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = inbox_threads.campaign_id
      and cm.user_id = auth.uid()
  )
  or exists (
    select 1 from public.campaigns c
    where c.id = inbox_threads.campaign_id and c.user_id = auth.uid()
  )
);

