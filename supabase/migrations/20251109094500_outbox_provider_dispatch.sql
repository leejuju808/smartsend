-- A) Outbox queue for provider delivery

create type if not exists public.outbox_status as enum ('queued','sending','sent','failed');

create table if not exists public.outbox_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status public.outbox_status not null default 'queued',
  last_error text,
  attempts int not null default 0,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  draft_id uuid references public.drafts(id) on delete set null,
  subject text not null check (length(subject) <= 200),
  body text not null,
  from_email text,
  to_email text,
  provider text,
  provider_message_id text,
  sent_at timestamptz
);

create index if not exists idx_outbox_status_created on public.outbox_requests(status, created_at);
create index if not exists idx_outbox_campaign on public.outbox_requests(campaign_id);

-- B) Delivery events (lightweight)

create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  provider text,
  provider_message_id text,
  event text not null,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_de_campaign_event on public.delivery_events(campaign_id, event);

-- C) RLS

alter table public.outbox_requests enable row level security;
alter table public.delivery_events enable row level security;

drop policy if exists "outbox_read" on public.outbox_requests;
create policy "outbox_read" on public.outbox_requests
  for select to authenticated using (public.is_campaign_viewer(campaign_id));

drop policy if exists "outbox_block_writes" on public.outbox_requests;
create policy "outbox_block_writes" on public.outbox_requests
  for all to authenticated using (false) with check (false);

drop policy if exists "devents_read" on public.delivery_events;
create policy "devents_read" on public.delivery_events
  for select to authenticated using (public.is_campaign_viewer(campaign_id));

drop policy if exists "devents_block_writes" on public.delivery_events;
create policy "devents_block_writes" on public.delivery_events
  for all to authenticated using (false) with check (false);

-- D) Secure RPC: enqueue provider send for a draft

create or replace function public.enqueue_outbox_for_draft(p_draft uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_thread uuid;
  v_campaign uuid;
  v_lead uuid;
  v_subject text;
  v_body text;
  v_to text;
  v_from text;
  v_id uuid;
begin
  select d.thread_id,
         d.campaign_id,
         d.lead_id,
         d.subject,
         d.body
    into v_thread,
         v_campaign,
         v_lead,
         v_subject,
         v_body
  from public.drafts d
  where d.id = p_draft;

  if v_thread is null then
    raise exception 'draft not found';
  end if;

  if not public.is_campaign_editor(v_campaign) then
    raise exception 'not authorized';
  end if;

  select email
    into v_to
  from public.leads
  where id = v_lead;

  select coalesce(t.account_email, t.from_email)
    into v_from
  from public.inbox_threads t
  where t.id = v_thread;

  insert into public.outbox_requests (
    thread_id,
    campaign_id,
    lead_id,
    draft_id,
    subject,
    body,
    from_email,
    to_email
  )
  values (
    v_thread,
    v_campaign,
    v_lead,
    p_draft,
    v_subject,
    v_body,
    v_from,
    v_to
  )
  returning id into v_id;

  update public.inbox_threads
     set needs_reply = false
   where id = v_thread;

  return v_id;
end;
$$;

-- E) OPTIONAL: adjust your prior send RPC to enqueue instead of DB-insert

create or replace function public.send_draft_now(p_draft uuid)
returns uuid
language plpgsql
security definer
as $$
begin
  return public.enqueue_outbox_for_draft(p_draft);
end;
$$;




