-- Drafts table for inbox replies
create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  source_message_id uuid references public.inbox_messages(id) on delete set null,
  subject text not null check (length(subject) <= 200),
  body text not null
);

alter table public.drafts enable row level security;

drop policy if exists drafts_read on public.drafts;
create policy drafts_read on public.drafts
  for select
  to authenticated
  using (public.is_campaign_viewer(campaign_id));

drop policy if exists drafts_write on public.drafts;
create policy drafts_write on public.drafts
  for insert
  to authenticated
  with check (public.is_campaign_editor(campaign_id));

drop policy if exists drafts_update on public.drafts;
create policy drafts_update on public.drafts
  for update
  to authenticated
  using (public.is_campaign_editor(campaign_id))
  with check (public.is_campaign_editor(campaign_id));

-- Ensure needs_reply column exists on threads
alter table public.inbox_threads
  add column if not exists needs_reply boolean not null default false;

-- Secure RPC to mark a thread as reviewed
create or replace function public.mark_thread_reviewed(p_thread uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
begin
  select campaign_id
    into v_campaign
    from public.inbox_threads
   where id = p_thread;

  if v_campaign is null or not public.is_campaign_editor(v_campaign) then
    return false;
  end if;

  update public.inbox_threads
     set needs_reply = false
   where id = p_thread;

  return true;
end;
$$;

-- Secure RPC to resume any queued sends and clear needs_reply
create or replace function public.resume_thread_sequence(p_thread uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_rows int := 0;
begin
  select campaign_id
    into v_campaign
    from public.inbox_threads
   where id = p_thread;

  if v_campaign is null or not public.is_campaign_editor(v_campaign) then
    return 0;
  end if;

  perform 1
    from information_schema.tables
   where table_schema = 'public'
     and table_name = 'send_queue';

  if found then
    perform 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'send_queue'
       and column_name = 'canceled';

    if found then
      update public.send_queue
         set canceled = false
       where thread_id = p_thread
         and coalesce(canceled, true) = true
         and coalesce(scheduled_at, now()) > now();

      get diagnostics v_rows = row_count;
    end if;
  end if;

  update public.inbox_threads
     set needs_reply = false
   where id = p_thread;

  return coalesce(v_rows, 0);
end;
$$;

-- Secure RPC to upsert a draft for a thread
create or replace function public.upsert_thread_draft(
  p_thread uuid,
  p_campaign uuid,
  p_lead uuid,
  p_subject text,
  p_body text,
  p_source_message uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_campaign_editor(p_campaign) then
    return null;
  end if;

  select id
    into v_id
    from public.drafts
   where thread_id = p_thread
   order by created_at desc
   limit 1;

  if v_id is null then
    insert into public.drafts (
      thread_id,
      campaign_id,
      lead_id,
      subject,
      body,
      source_message_id
    )
    values (
      p_thread,
      p_campaign,
      p_lead,
      p_subject,
      p_body,
      p_source_message
    )
    returning id into v_id;
  else
    update public.drafts
       set subject = p_subject,
           body = p_body,
           source_message_id = p_source_message,
           created_at = now()
     where id = v_id;
  end if;

  update public.inbox_threads
     set needs_reply = true
   where id = p_thread;

  return v_id;
end;
$$;




