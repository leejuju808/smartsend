-- Reply detection events + autopause loop (idempotent)

-- 1A) Event store -------------------------------------------------------------
create table if not exists public.reply_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  thread_id uuid references public.inbox_threads(id) on delete set null,
  message_id uuid references public.inbox_messages(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  label text,
  confidence numeric,
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_reply_events_thread on public.reply_events(thread_id);
create index if not exists idx_reply_events_lead on public.reply_events(lead_id);
create index if not exists idx_reply_events_created on public.reply_events(created_at desc);


-- 1B) Inbox indexes -----------------------------------------------------------
create index if not exists idx_inbox_messages_created_dir
  on public.inbox_messages(created_at desc, direction);


-- 1C) Autopause helper --------------------------------------------------------
drop function if exists public.autopause_on_reply(uuid, uuid);

create or replace function public.autopause_on_reply(
  p_thread uuid,
  p_lead uuid,
  p_campaign uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid := p_thread;
  v_campaign uuid := p_campaign;
  v_lead uuid := p_lead;
begin
  if v_thread is null then
    select id, campaign_id, lead_id
      into v_thread, v_campaign, v_lead
    from public.inbox_threads
    where id = p_thread
    limit 1;
  end if;

  if (v_campaign is null or v_lead is null) and v_thread is not null then
    select campaign_id, lead_id
      into v_campaign, v_lead
    from public.inbox_threads
    where id = v_thread;
  end if;

  if v_thread is null and v_campaign is not null and v_lead is not null then
    select id
      into v_thread
    from public.inbox_threads
    where campaign_id = v_campaign
      and lead_id = v_lead
    order by replied_at desc nulls last, updated_at desc
    limit 1;
  end if;

  if v_campaign is null or v_lead is null then
    return;
  end if;

  update public.campaign_leads
     set status = 'replied',
         replied = true
   where campaign_id = v_campaign
     and lead_id = v_lead
     and (status is distinct from 'replied' or replied is distinct from true);

  delete from public.send_queue
   where campaign_id = v_campaign
     and lead_id = v_lead;

  update public.inbox_threads
     set replied_at = coalesce(replied_at, now()),
         stopped_by_reply = true,
         updated_at = now()
   where id = v_thread;
end;
$$;

revoke all on function public.autopause_on_reply(uuid, uuid, uuid) from public;
grant execute on function public.autopause_on_reply(uuid, uuid, uuid) to service_role;


-- 1D) RLS policies ------------------------------------------------------------
alter table public.reply_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reply_events'
      and policyname = 'reply_events_select'
  ) then
    create policy reply_events_select on public.reply_events
      for select using (
        exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = reply_events.campaign_id
            and cm.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.campaigns c
          where c.id = reply_events.campaign_id
            and c.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reply_events'
      and policyname = 'reply_events_insert_service'
  ) then
    create policy reply_events_insert_service on public.reply_events
      for insert with check (true);
  end if;
end
$$;


-- 1E) Edge trigger wiring -----------------------------------------------------
create extension if not exists pg_net;

drop function if exists public._call_ai_reply_detect(uuid);

create or replace function public._call_ai_reply_detect(p_message uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := current_setting('app.settings.edge_base', true);
  v_full text;
  v_res jsonb;
begin
  if coalesce(v_url, '') = '' then
    v_url := 'https://<YOUR_SUPABASE_PROJECT>.functions.supabase.co';
  end if;

  v_full := v_url || '/ai-reply-detect';

  select net.http_post(
    url := v_full,
    body := json_build_object('message_id', p_message)::text,
    headers := jsonb_build_object('content-type', 'application/json')
  )::jsonb
  into v_res;

  perform 1;
exception
  when others then
    perform 1;
end;
$$;

revoke all on function public._call_ai_reply_detect(uuid) from public;
grant execute on function public._call_ai_reply_detect(uuid) to service_role;

drop trigger if exists trg_inbox_ai_reply on public.inbox_messages;
create trigger trg_inbox_ai_reply
after insert on public.inbox_messages
for each row
when (new.direction = 'inbound')
execute function public._call_ai_reply_detect(new.id);


-- 1F) Helper views ------------------------------------------------------------
create or replace view public.v_message_last_reply_event as
select distinct on (message_id)
  message_id,
  label,
  confidence,
  created_at
from public.reply_events
where message_id is not null
order by message_id, created_at desc;

create or replace view public.v_thread_last_reply_event as
select distinct on (thread_id)
  thread_id,
  label,
  confidence,
  created_at
from public.reply_events
where thread_id is not null
order by thread_id, created_at desc;

grant select on public.v_message_last_reply_event to authenticated;
grant select on public.v_thread_last_reply_event to authenticated;
revoke all on public.v_message_last_reply_event from anon;
revoke all on public.v_thread_last_reply_event from anon;


-- Optional: refresh dependent materialized views after structural change
-- (safe to wrap in try/catch in case they do not exist).
do $$
begin
  perform 1 from pg_matviews where schemaname = 'public' and matviewname = 'mv_replies_inbox';
  if found then
    begin
      refresh materialized view concurrently public.mv_replies_inbox;
    exception
      when others then
        refresh materialized view public.mv_replies_inbox;
    end;
  end if;
exception
  when undefined_table then
    null;
end;
$$;

