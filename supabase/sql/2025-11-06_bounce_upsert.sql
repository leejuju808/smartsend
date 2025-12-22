-- Bounce handling helpers

-- A) Faster lookup by provider + provider message id
create index if not exists idx_inbox_msg_provider_mid
  on public.inbox_messages(provider, provider_message_id);

-- B) Upsert a bounce message and trigger existing autopause / suppression flows
create or replace function public.upsert_bounce_message(
  p_provider text,
  p_provider_message_id text,
  p_campaign uuid,
  p_lead uuid,
  p_subject text default 'Delivery failure',
  p_body text default 'Delivery failed',
  p_received_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_msg uuid;
begin
  -- If this provider message already exists as inbound, just relabel as bounce.
  select id
    into v_msg
    from public.inbox_messages
   where direction = 'in'
     and provider = p_provider
     and provider_message_id = p_provider_message_id
   order by created_at asc
   limit 1;

  if v_msg is not null then
    update public.inbox_messages
       set ai_label = 'bounce',
           ai_confidence = 1.0,
           classified_at = coalesce(classified_at, now())
     where id = v_msg;

    return v_msg;
  end if;

  -- Resolve thread via campaign + lead if provided
  if p_campaign is not null and p_lead is not null then
    select public.ensure_thread(p_campaign, p_lead) into v_thread;
  end if;

  -- Insert a minimal inbound bounce message (triggers autopause + suppression via existing hooks)
  insert into public.inbox_messages (
    thread_id,
    direction,
    from_email,
    subject,
    body_text,
    provider,
    provider_message_id,
    provider_thread_id,
    ai_label,
    ai_confidence,
    classified_at,
    created_at
  ) values (
    v_thread,
    'in',
    null,
    p_subject,
    p_body,
    p_provider,
    p_provider_message_id,
    null,
    'bounce',
    1.0,
    now(),
    coalesce(p_received_at, now())
  )
  returning id into v_msg;

  return v_msg;
end;
$$;

grant execute on function public.upsert_bounce_message(text, text, uuid, uuid, text, text, timestamptz) to service_role;


-- Lead-level bounce flags and helpers
alter table public.leads
  add column if not exists bounced boolean not null default false,
  add column if not exists bounce_count int not null default 0,
  add column if not exists last_bounce_at timestamptz,
  add column if not exists last_bounce_reason text;

create index if not exists idx_leads_bounced on public.leads(bounced);


-- Ensure delivery_events has provider metadata
alter table public.delivery_events
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists reason text,
  add column if not exists raw jsonb;

create index if not exists idx_de_provider_msg on public.delivery_events(provider, provider_message_id);
create index if not exists idx_de_lead_time on public.delivery_events(lead_id, created_at desc);


-- Helper to cancel queued sends for a specific campaign + lead
create or replace function public.cancel_future_sends(
  p_campaign uuid,
  p_lead uuid,
  p_reason text default 'autopause:bounce'
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.send_queue
     set status = 'canceled',
         canceled_reason = coalesce(canceled_reason, p_reason),
         updated_at = now()
   where campaign_id = p_campaign
     and lead_id = p_lead
     and status in ('pending','retrying');
$$;


-- Record a bounce, mark the lead, and mute related threads
create or replace function public.record_bounce(
  p_account uuid,
  p_campaign uuid,
  p_lead uuid,
  p_provider text,
  p_provider_message_id text,
  p_reason text,
  p_raw jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Log the bounce delivery event
  insert into public.delivery_events (
    account_id,
    campaign_id,
    lead_id,
    type,
    provider,
    provider_message_id,
    reason,
    raw
  ) values (
    p_account,
    p_campaign,
    p_lead,
    'bounce',
    p_provider,
    p_provider_message_id,
    p_reason,
    p_raw
  );

  -- Mark the lead as bounced
  update public.leads
     set bounced = true,
         bounce_count = coalesce(bounce_count, 0) + 1,
         last_bounce_at = now(),
         last_bounce_reason = p_reason
   where id = p_lead;

  -- Cancel any future sends for this campaign / lead
  perform public.cancel_future_sends(p_campaign, p_lead, 'autopause:bounce');

  -- Mute inbox threads for this campaign / lead pair
  update public.inbox_threads
     set muted = true,
         updated_at = now()
   where campaign_id = p_campaign
     and lead_id = p_lead;
end;
$$;

grant execute on function public.record_bounce(uuid, uuid, uuid, text, text, text, jsonb) to service_role;
revoke all on function public.record_bounce(uuid, uuid, uuid, text, text, text, jsonb) from anon, authenticated;


