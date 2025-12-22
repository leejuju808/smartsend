-- Tracking Events System: Opens, Clicks, Unsubscribes + Send Log Hardening
-- This migration adds tracking capabilities and hardens send_logs for correlation

-- A) Harden send_logs for correlation
alter table public.send_logs
  add column if not exists step_no int,
  add column if not exists variant_id uuid references public.campaign_step_variants(id) on delete set null,
  add column if not exists provider text,  -- 'gmail' | 'outlook' | 'sim'
  add column if not exists provider_message_id text,
  add column if not exists provider_thread_id text,
  add column if not exists to_email citext,
  add column if not exists subject_snapshot text;

create index if not exists idx_logs_campaign_lead_step on public.send_logs(campaign_id, lead_id, step_no);
create index if not exists idx_logs_provider_msg on public.send_logs(provider, provider_message_id);

-- B) Tracking events table (read-only to members per your RLS plan)
create table if not exists public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  send_log_id uuid references public.send_logs(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  kind text not null check (kind in ('open','click','unsubscribe')),
  url text,                 -- for click/unsubscribe
  user_agent text,
  ip inet,
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_te_campaign_created on public.tracking_events(campaign_id, created_at desc);
create index if not exists idx_te_sendlog_kind on public.tracking_events(send_log_id, kind);

-- C) RLS already enabled earlier; add policies if missing
-- View: members of campaign via join to send_logs (or directly by campaign_id)
drop policy if exists te_view on public.tracking_events;
create policy te_view on public.tracking_events
for select using (
  public.can_view_campaign(campaign_id)
);

-- Allow service role to insert tracking events
drop policy if exists te_insert_service on public.tracking_events;
create policy te_insert_service on public.tracking_events
for insert to service_role using (true) with check (true);

-- D) Helper: mark thread replied + cancel future queue
create or replace function public.mark_thread_replied(p_thread uuid, p_at timestamptz default now())
returns void
language plpgsql
security definer
as $$
begin
  update public.inbox_threads
     set replied_at = coalesce(replied_at, p_at),
         stopped_by_reply = true,
         updated_at = now()
   where id = p_thread;

  -- Cancel future queue for this thread (prior function from earlier slice)
  perform public.cancel_future_queue_for_thread(p_thread);
end;
$$;

-- E) Helper: create/find thread by (campaign, lead)
create or replace function public.ensure_thread(p_campaign uuid, p_lead uuid)
returns uuid
language plpgsql
security definer
as $$
declare v uuid;
begin
  select id into v from public.inbox_threads
   where campaign_id = p_campaign and lead_id = p_lead
   order by created_at asc
   limit 1;

  if v is null then
    insert into public.inbox_threads (campaign_id, lead_id, created_at)
    values (p_campaign, p_lead, now()) returning id into v;
  end if;

  return v;
end;
$$;

-- F) HMAC helpers (use your own secret in env; fallback to service key)
create or replace function public._tracking_secret()
returns text language sql stable as $$
  select coalesce(current_setting('app.tracking_secret', true), 'fallback-secret');
$$;

create or replace function public._hmac_sha256_hex(p text)
returns text language sql immutable as $$
  select encode(hmac(p::bytea, public._tracking_secret()::bytea, 'sha256'), 'hex');
$$;

-- G) Build + verify tokens
-- canonical payloads:
-- open:  "open:<send_log_id>:<email>"
-- click: "click:<send_log_id>:<url>"
-- unsub: "unsub:<campaign_id>:<email>"

create or replace function public._make_token(p text) returns text
language sql immutable as $$
  select public._hmac_sha256_hex(p);
$$;

create or replace function public._verify(p text, tok text) returns boolean
language sql immutable as $$
  select public._hmac_sha256_hex(p) = tok;
$$;

-- H) Record tracking events (security definer to bypass RLS on write)
create or replace function public._record_tracking(
  p_kind text,
  p_campaign uuid,
  p_send_log uuid,
  p_lead uuid,
  p_url text,
  p_ua text,
  p_ip inet,
  p_meta jsonb
) returns void
language sql security definer as $$
  insert into public.tracking_events (campaign_id, send_log_id, lead_id, kind, url, user_agent, ip, meta)
  values (p_campaign, p_send_log, p_lead, p_kind, p_url, p_ua, p_ip, p_meta);
$$;

-- Grant execute permissions
grant execute on function public.mark_thread_replied(uuid, timestamptz) to service_role;
grant execute on function public.ensure_thread(uuid, uuid) to service_role;
grant execute on function public._verify(text, text) to service_role;
grant execute on function public._record_tracking(text, uuid, uuid, uuid, text, text, inet, jsonb) to service_role;

-- I) Ensure inbox_messages has required columns for inbound handler
alter table public.inbox_messages
  add column if not exists body_text text,
  add column if not exists provider text check (provider in ('gmail', 'outlook', 'sim'));

