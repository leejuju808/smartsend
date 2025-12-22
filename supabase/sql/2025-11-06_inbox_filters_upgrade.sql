-- Inbox label standardization and filter helpers (idempotent)
-- Run in Supabase SQL editor.

-- A) Standardize AI labels -----------------------------------------------------
alter table public.inbox_messages
  add column if not exists ai_label text;

alter table public.inbox_messages
  drop constraint if exists inbox_messages_ai_label_check;

alter table public.inbox_messages
  add constraint inbox_messages_ai_label_chk
  check (
    ai_label is null
    or ai_label in (
      'reply-positive','reply-neutral','reply-negative',
      'reply-oos','reply-ooo','noise'
    )
  );

create index if not exists idx_im_ai_label on public.inbox_messages(ai_label);


-- B) Auto-pause queue on inbound replies ---------------------------------------
create or replace function public.autopause_on_reply(p_campaign uuid, p_lead uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.send_queue
     set status = 'canceled',
         canceled_reason = coalesce(canceled_reason, 'autopause:reply'),
         updated_at = now()
   where campaign_id = p_campaign
     and lead_id = p_lead
     and status in ('pending','retrying');
$$;

revoke all on function public.autopause_on_reply(uuid, uuid) from anon, authenticated;


-- C) Ensure inbound writer updates replied_at and cancels queue -----------------
create or replace function public._inbox_write_inbound(
  p_lead uuid,
  p_campaign uuid,
  p_provider text,
  p_provider_thread_id text,
  p_provider_message_id text,
  p_subject text,
  p_body_html text,
  p_ai_label text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
begin
  select id into v_thread
    from public.inbox_threads
   where campaign_id = p_campaign
     and lead_id = p_lead
   order by updated_at desc
   limit 1;

  if v_thread is null then
    insert into public.inbox_threads (campaign_id, lead_id, provider, provider_thread_id, updated_at, replied_at)
    values (p_campaign, p_lead, p_provider, p_provider_thread_id, now(), now())
    returning id into v_thread;
  else
    update public.inbox_threads
       set provider = coalesce(provider, p_provider),
           provider_thread_id = coalesce(provider_thread_id, p_provider_thread_id),
           updated_at = now(),
           replied_at = now()
     where id = v_thread;
  end if;

  insert into public.inbox_messages (
    thread_id, direction, subject, body_html, provider, provider_message_id, ai_label
  ) values (
    v_thread, 'inbound', p_subject, p_body_html, p_provider, p_provider_message_id, p_ai_label
  );

  perform public.autopause_on_reply(p_campaign, p_lead);

  return v_thread;
end;
$$;

revoke all on function public._inbox_write_inbound(uuid, uuid, text, text, text, text, text, text) from anon, authenticated;


-- D) Filter-friendly overview view ---------------------------------------------
create or replace view public.v_inbox_filters as
with last_msg as (
  select m.thread_id,
         (array_agg(m.ai_label order by m.created_at desc))[1] as last_ai_label
    from public.inbox_messages m
   group by m.thread_id
)
select o.*, lm.last_ai_label
  from public.v_inbox_overview o
  left join last_msg lm on lm.thread_id = o.thread_id;

grant select on public.v_inbox_filters to authenticated;
revoke all on public.v_inbox_filters from anon;












