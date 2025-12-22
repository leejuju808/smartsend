-- Reply detection + pause helper baseline (idempotent)

-- A) Delivery events table and indexes
create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  thread_id uuid references public.inbox_threads(id) on delete set null,
  step_id uuid references public.campaign_steps(id) on delete set null,
  event text not null,
  meta jsonb not null default '{}'::jsonb
);

alter table public.delivery_events
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade,
  add column if not exists lead_id uuid references public.leads(id) on delete cascade,
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete set null,
  add column if not exists step_id uuid references public.campaign_steps(id) on delete set null,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  alter column event set not null;

do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conname = 'delivery_events_event_check'
       and conrelid = 'public.delivery_events'::regclass
  ) then
    alter table public.delivery_events
      drop constraint delivery_events_event_check;
  end if;
exception
  when undefined_table then null;
end;
$$;

alter table public.delivery_events
  add constraint delivery_events_event_check
  check (
    event in (
      'sent','delivered','opened','clicked','bounced',
      'reply_detected','ooo_detected','unsubscribe_detected','manual_pause','enqueue_blocked'
    )
  );

create index if not exists idx_delivery_events_lead on public.delivery_events(lead_id);
create index if not exists idx_delivery_events_campaign on public.delivery_events(campaign_id);


-- B) Reply detections table setup
create table if not exists public.reply_detections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  thread_id uuid references public.inbox_threads(id) on delete set null,
  classifier text not null default 'rule',
  intent text not null,
  confidence real not null default 0.6,
  evidence jsonb not null default '{}'::jsonb
);

alter table public.reply_detections
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade,
  add column if not exists lead_id uuid references public.leads(id) on delete cascade,
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete set null,
  add column if not exists classifier text not null default 'rule',
  add column if not exists intent text not null default 'unknown',
  add column if not exists confidence real not null default 0.6,
  add column if not exists evidence jsonb not null default '{}'::jsonb;

update public.reply_detections
   set intent = coalesce(intent, 'unknown')
 where intent is null;

do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conname = 'reply_detections_intent_check'
       and conrelid = 'public.reply_detections'::regclass
  ) then
    alter table public.reply_detections
      drop constraint reply_detections_intent_check;
  end if;
exception
  when undefined_table then null;
end;
$$;

alter table public.reply_detections
  add constraint reply_detections_intent_check
  check (
    intent in ('ooo','unsubscribe','positive','negative','question','routing','neutral','unknown')
  );

create index if not exists idx_reply_detections_lead on public.reply_detections(lead_id, created_at desc);


-- C) Follow-up tasks scheduling metadata
create table if not exists public.followup_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  step_id uuid references public.campaign_steps(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  send_after timestamptz not null,
  sent_at timestamptz,
  canceled_at timestamptz
);

alter table public.followup_tasks
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade,
  add column if not exists step_id uuid references public.campaign_steps(id) on delete cascade,
  add column if not exists lead_id uuid references public.leads(id) on delete cascade,
  add column if not exists send_after timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists canceled_at timestamptz;

update public.followup_tasks
   set send_after = coalesce(send_after, created_at)
 where send_after is null;

create index if not exists idx_followups_lead_future
  on public.followup_tasks(lead_id, send_after);


-- D) Lead pause metadata
alter table public.campaign_leads
  add column if not exists paused_until timestamptz,
  add column if not exists paused_reason text;


-- E) Pause helper for replies
create or replace function public.pause_followups_on_reply(
  p_campaign uuid,
  p_lead uuid,
  p_reason text,
  p_days int default 30
) returns void
language plpgsql
as $$
declare
  v_pause_until timestamptz := case
    when coalesce(p_days, 0) > 0 then now() + make_interval(days => p_days)
    else now()
  end;
begin
  if p_campaign is null or p_lead is null then
    return;
  end if;

  update public.followup_tasks
     set canceled_at = now()
   where campaign_id = p_campaign
     and lead_id = p_lead
     and sent_at is null
     and canceled_at is null
     and coalesce(send_after, now()) > now();

  update public.campaign_leads
     set paused_until = v_pause_until,
         paused_reason = p_reason
   where campaign_id = p_campaign
     and lead_id = p_lead;

  update public.inbox_threads
     set updated_at = now()
   where campaign_id = p_campaign
     and lead_id = p_lead;
end;
$$;


-- F) RLS policies for analytics reads
alter table public.reply_detections enable row level security;
alter table public.delivery_events enable row level security;

create policy if not exists read_reply_detections
  on public.reply_detections
  for select
  using (public.is_campaign_viewer(campaign_id));

create policy if not exists read_delivery_events
  on public.delivery_events
  for select
  using (public.is_campaign_viewer(campaign_id));


-- G) Updated ingest helper returns metadata for downstream hooks
create or replace function public.ingest_inbound_message(
  p_provider text,
  p_account uuid,
  p_provider_thread_id text,
  p_provider_message_id text,
  p_from_email text,
  p_to_email text,
  p_subject text,
  p_html text,
  p_text text,
  p_headers jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_lead uuid;
  v_campaign uuid;
  v_msg uuid;
  v_ai text;
begin
  if p_provider_thread_id is not null then
    select id, campaign_id, lead_id
      into v_thread, v_campaign, v_lead
    from public.inbox_threads
    where provider = p_provider
      and provider_thread_id = p_provider_thread_id
      and (account_id = p_account or p_account is null)
    limit 1;
  end if;

  if v_thread is null and p_to_email is not null then
    begin
      select l.id, l.campaign_id
        into v_lead, v_campaign
      from public.leads l
      where lower(l.email) = lower(p_to_email)
      order by l.created_at desc
      limit 1;
    exception
      when undefined_column then
        select cl.lead_id, cl.campaign_id
          into v_lead, v_campaign
        from public.campaign_leads cl
        join public.leads l on l.id = cl.lead_id
        where lower(l.email) = lower(p_to_email)
        order by cl.created_at desc
        limit 1;
    end;

    if v_lead is not null then
      insert into public.inbox_threads (
        campaign_id,
        lead_id,
        account_id,
        provider,
        provider_thread_id,
        subject,
        updated_at
      )
      values (
        v_campaign,
        v_lead,
        p_account,
        p_provider,
        p_provider_thread_id,
        coalesce(p_subject, ''),
        now()
      )
      returning id into v_thread;
    end if;
  end if;

  if v_thread is null then
    insert into public.inbox_threads (
      campaign_id,
      lead_id,
      account_id,
      provider,
      provider_thread_id,
      subject,
      updated_at
    )
    values (
      v_campaign,
      v_lead,
      p_account,
      p_provider,
      p_provider_thread_id,
      coalesce(p_subject, ''),
      now()
    )
    returning id into v_thread;
  end if;

  v_ai := public.detect_ai_label(coalesce(p_text, p_html, p_subject));

  insert into public.inbox_messages(
    thread_id,
    direction,
    created_at,
    html,
    text,
    from_email,
    to_email,
    ai_label,
    provider_message_id,
    headers
  )
  values (
    v_thread,
    'inbound',
    now(),
    p_html,
    p_text,
    p_from_email,
    p_to_email,
    v_ai,
    p_provider_message_id,
    p_headers
  )
  on conflict (provider_message_id) do nothing
  returning id into v_msg;

  if v_msg is null then
    select id
      into v_msg
    from public.inbox_messages
    where provider_message_id = p_provider_message_id
    order by created_at desc
    limit 1;
  end if;

  update public.inbox_threads
    set updated_at = now()
  where id = v_thread;

  return jsonb_build_object(
    'message_id', v_msg,
    'thread_id', v_thread,
    'campaign_id', v_campaign,
    'lead_id', v_lead
  );
end;
$$;





