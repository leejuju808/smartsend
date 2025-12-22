-- Inbound reply detection: extend inbound_messages, indexes, and RPC helpers

-- 1) Extend inbound_messages to support workspace + lead linkage and classification
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbound_messages' and column_name = 'workspace_id'
  ) then
    alter table public.inbound_messages add column workspace_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbound_messages' and column_name = 'campaign_id'
  ) then
    alter table public.inbound_messages add column campaign_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbound_messages' and column_name = 'lead_id'
  ) then
    alter table public.inbound_messages add column lead_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbound_messages' and column_name = 'thread_id'
  ) then
    alter table public.inbound_messages add column thread_id text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbound_messages' and column_name = 'to_email'
  ) then
    alter table public.inbound_messages add column to_email text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbound_messages' and column_name = 'from_email'
  ) then
    alter table public.inbound_messages add column from_email text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbound_messages' and column_name = 'is_human_reply'
  ) then
    alter table public.inbound_messages add column is_human_reply boolean;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbound_messages' and column_name = 'meta'
  ) then
    alter table public.inbound_messages add column meta jsonb;
  end if;
end $$;

-- Backfill workspace_id as nullable for now; enforcement can be added later if desired

-- 2) Indexes
create index if not exists inbound_messages_workspace_idx on public.inbound_messages(workspace_id, created_at desc);
create index if not exists inbound_messages_lead_idx on public.inbound_messages(lead_id);

-- 3) Helper RPCs
create or replace function public.set_lead_replied(p_lead uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.leads
     set status = 'replied', updated_at = now()
   where id = p_lead and status <> 'replied';

  -- Cancel any queued or in-flight sends for this lead
  update public.send_queue
     set status = 'canceled'
   where lead_id = p_lead
     and status in ('queued','sending');
end;
$$;

revoke all on function public.set_lead_replied(uuid) from public;
grant execute on function public.set_lead_replied(uuid) to anon, authenticated, service_role;

create or replace function public.log_lead_event(p_workspace uuid, p_campaign uuid, p_lead uuid, p_event text, p_meta jsonb)
returns void
language sql
security definer
as $$
  insert into public.campaign_logs (workspace_id, campaign_id, lead_id, event, meta)
  values (p_workspace, p_campaign, p_lead, p_event, p_meta);
$$;

grant execute on function public.log_lead_event(uuid,uuid,uuid,text,jsonb) to anon, authenticated, service_role;


