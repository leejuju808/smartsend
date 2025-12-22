-- Inbox Schema Hardening + Reply Detection System
-- Idempotent migration - safe to run multiple times

-- =====================================================
-- 1) SQL — harden inbox schema (idempotent)
-- =====================================================

-- Minimal columns we rely on for inbox_threads
alter table public.inbox_threads
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade,
  add column if not exists lead_id uuid references public.leads(id) on delete cascade,
  add column if not exists account_id uuid references public.connected_accounts(id) on delete cascade,
  add column if not exists replied_at timestamptz,
  add column if not exists stopped_by_reply boolean default false;

create index if not exists idx_threads_campaign_lead on public.inbox_threads(campaign_id, lead_id);
create index if not exists idx_threads_replied_at on public.inbox_threads(replied_at);

-- Minimal columns we rely on for inbox_messages
-- Note: direction may already exist with 'in'/'out' values, we'll handle both
alter table public.inbox_messages
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete cascade,
  add column if not exists account_id uuid references public.connected_accounts(id) on delete cascade,
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade,
  add column if not exists lead_id uuid references public.leads(id) on delete cascade,
  add column if not exists from_email citext,
  add column if not exists to_email citext,
  add column if not exists provider_msg_id text,
  add column if not exists subject text,
  add column if not exists body_html text,
  add column if not exists received_at timestamptz,
  add column if not exists ai_label text,
  add column if not exists ai_intent text,
  add column if not exists ai_confidence numeric,
  add column if not exists classified_at timestamptz;

-- Update direction column if it doesn't exist, or update constraint to allow both formats
do $$
begin
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'inbox_messages' and column_name = 'direction') then
    alter table public.inbox_messages add column direction text;
  end if;
  
  -- Drop existing constraint if it exists and is too restrictive
  alter table public.inbox_messages drop constraint if exists inbox_messages_direction_check;
  
  -- Add flexible constraint that allows both 'in'/'out' and 'inbound'/'outbound'
  alter table public.inbox_messages 
    add constraint inbox_messages_direction_check 
    check (direction in ('in', 'out', 'inbound', 'outbound'));
end $$;

create index if not exists idx_in_msgs_thread on public.inbox_messages(thread_id);
create index if not exists idx_in_msgs_direction on public.inbox_messages(direction);
create index if not exists idx_in_msgs_lead on public.inbox_messages(lead_id);

-- =====================================================
-- 2) SQL — helper: mark thread replied + cancel future steps
-- =====================================================

-- Create cancel_future_queue_for_campaign_lead function
create or replace function public.cancel_future_queue_for_campaign_lead(p_campaign_id uuid, p_lead_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  update public.send_queue
     set status = 'canceled', 
         updated_at = now(), 
         error = coalesce(error,'') || ' [auto-cancel: reply]'
   where campaign_id = p_campaign_id
     and lead_id = p_lead_id
     and status in ('pending', 'queued', 'scheduled', 'retrying')
     and (scheduled_at > now() or scheduled_at is null);
  
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Mark thread replied and cancel queued items for that campaign+lead
create or replace function public.note_thread_reply(p_thread uuid, p_at timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select campaign_id, lead_id into r from public.inbox_threads where id = p_thread;
  if not found then return; end if;

  update public.inbox_threads
     set replied_at = coalesce(replied_at, p_at),
         stopped_by_reply = true
   where id = p_thread;

  perform public.cancel_future_queue_for_campaign_lead(r.campaign_id, r.lead_id);
end;
$$;

-- =====================================================
-- 3) SQL — lightweight intent/label heuristic (can be upgraded later)
-- =====================================================

-- Heuristic classification (fallback when AI not run yet)
create or replace function public.heuristic_label(p_text text)
returns text
language sql immutable as $$
  select case
    when p_text ~* '\b(unsubscribe|remove me|opt out|stop)\b' then 'unsubscribe'
    when p_text ~* '\b(out of office|ooo|automatic reply)\b' then 'ooo'
    when p_text ~* '\b(bounce|undeliverable|delivery has failed)\b' then 'bounce'
    when p_text ~* '\b(call|schedule|book|meeting)\b' then 'positive'
    when p_text ~* '\b(price|cost|quote|budget)\b' then 'neutral'
    when p_text ~* '\b(not interested|no longer|stop emailing)\b' then 'negative'
    else 'other'
  end
$$;

-- Guess a tiny intent
create or replace function public.heuristic_intent(p_text text)
returns text
language sql immutable as $$
  select case
    when p_text ~* '\b(call|meeting|schedule|calendar|zoom)\b' then 'book call'
    when p_text ~* '\b(price|cost|quote|rates)\b' then 'pricing question'
    when p_text ~* '\b(cancel|unsubscribe|remove)\b' then 'unsubscribe'
    else null
  end
$$;

-- =====================================================
-- 4) SQL — AFTER INSERT trigger on inbound messages
-- =====================================================

-- Ensure suppression_list table exists with required columns
create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  account_id uuid references public.connected_accounts(id) on delete cascade,
  email citext not null,
  reason text,
  source text,
  created_at timestamptz default now(),
  unique (email, user_id, account_id)
);

create index if not exists idx_suppression_email on public.suppression_list(email);
create index if not exists idx_suppression_user on public.suppression_list(user_id);

-- Enable RLS if not already enabled
alter table public.suppression_list enable row level security;

-- Create RLS policies if they don't exist
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'suppression_list' and policyname = 'suppression_list_select'
  ) then
    create policy "suppression_list_select" on public.suppression_list
      for select using (auth.uid() = user_id or user_id is null);
  end if;
  
  if not exists (
    select 1 from pg_policies where tablename = 'suppression_list' and policyname = 'suppression_list_insert'
  ) then
    create policy "suppression_list_insert" on public.suppression_list
      for insert with check (true); -- Allow service role inserts
  end if;
end $$;

-- Trigger function: Sets ai_label/intent heuristically (if empty),
-- If inbound and from the lead, mark replied and cancel future queue,
-- Writes an optional suppression row for "unsubscribe".
create or replace function public.after_inbound_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := coalesce(NEW.body_html, NEW.subject, '');
  v_lead_email citext;
  v_label text;
  v_user_id uuid;
begin
  -- Heuristic labels if not already set by AI
  -- Handle both 'in' and 'inbound' direction values
  if NEW.direction in ('inbound', 'in') and NEW.ai_label is null then
    v_label := public.heuristic_label(v_body);
    update public.inbox_messages
       set ai_label = v_label,
           ai_intent = coalesce(public.heuristic_intent(v_body), ai_intent),
           ai_confidence = 0.4,
           classified_at = now()
     where id = NEW.id;
  end if;

  -- If inbound from the lead -> mark replied + cancel future follow-ups
  -- Handle both 'in' and 'inbound' direction values
  if NEW.direction in ('inbound', 'in') then
    select email into v_lead_email from public.leads where id = NEW.lead_id;

    if v_lead_email is not null and lower(v_lead_email) = lower(NEW.from_email) then
      perform public.note_thread_reply(NEW.thread_id, coalesce(NEW.received_at, now()));
    end if;

    -- If unsubscribe, add to suppression and ensure cancel is applied
    if coalesce(NEW.ai_label, v_label) = 'unsubscribe' then
      -- Get user_id from campaign
      select user_id into v_user_id
      from public.campaigns
      where id = NEW.campaign_id;

      insert into public.suppression_list(user_id, account_id, email, reason, source)
      values (v_user_id, NEW.account_id, v_lead_email, 'unsubscribe', 'reply')
      on conflict do nothing;

      perform public.cancel_future_queue_for_campaign_lead(NEW.campaign_id, NEW.lead_id);
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_after_inbound_message on public.inbox_messages;
create trigger trg_after_inbound_message
after insert on public.inbox_messages
for each row
execute function public.after_inbound_message();

-- =====================================================
-- 6) Dashboard views — reply rates + time-to-reply
-- =====================================================

-- Per-campaign reply rate
-- Note: Requires send_logs table with campaign_id, lead_id, and status columns
create or replace view public.campaign_reply_stats as
select
  c.id as campaign_id,
  c.name,
  count(distinct t.lead_id) filter (where t.replied_at is not null) as leads_replied,
  count(distinct q.lead_id) filter (where q.status = 'sent') as leads_contacted,
  round(
    100.0 * count(distinct t.lead_id) filter (where t.replied_at is not null)
    / nullif(count(distinct q.lead_id) filter (where q.status = 'sent'),0)
    ,2) as reply_rate_pct
from public.campaigns c
left join public.inbox_threads t on t.campaign_id = c.id
left join public.send_logs q on q.campaign_id = c.id and q.status = 'sent'
group by 1,2
order by reply_rate_pct desc nulls last;

-- Time to first reply (median mins)
create or replace view public.campaign_time_to_reply as
select
  c.id as campaign_id,
  c.name,
  percentile_disc(0.5) within group (order by extract(epoch from (t.replied_at - s.created_at))/60.0)
    as median_minutes_to_reply
from public.campaigns c
join public.inbox_threads t on t.campaign_id = c.id and t.replied_at is not null
join lateral (
  select min(created_at) as created_at
  from public.send_logs
  where campaign_id = c.id and lead_id = t.lead_id and status='sent'
) s on true
group by 1,2;

-- Grant access to views
grant select on public.campaign_reply_stats to authenticated;
grant select on public.campaign_time_to_reply to authenticated;

