-- Opt-Out Keywords Detection System
-- Automatically detects opt-out language in inbound messages and marks leads as opted out

-- =====================================================
-- A) Opt-out keywords table (global + per-user)
-- =====================================================
create table if not exists public.opt_out_keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade, -- null = global default
  phrase text not null,
  created_at timestamptz not null default now()
);

-- Unique constraint: user-specific phrases must be unique per user, global phrases must be unique
create unique index if not exists uq_opt_out_keywords_user_phrase 
  on public.opt_out_keywords(user_id, lower(phrase)) 
  where user_id is not null;
create unique index if not exists uq_opt_out_keywords_global_phrase 
  on public.opt_out_keywords(lower(phrase)) 
  where user_id is null;

create index if not exists idx_opt_out_keywords_user on public.opt_out_keywords(user_id);
create index if not exists idx_opt_out_keywords_global on public.opt_out_keywords(phrase) where user_id is null;

-- Seed some sane defaults
insert into public.opt_out_keywords(user_id, phrase)
select null, unnest(array[
  'unsubscribe','opt out','opt-out','remove me','stop','do not contact',
  'no more emails','take me off','please remove','stop emailing','unlist',
  'remove my email','never contact me','don''t email me','cancel my subscription'
])
on conflict do nothing;

-- =====================================================
-- B) Fast helper to get normalized text from inbound messages
-- =====================================================
create or replace function public._normalize_msg_text(p_msg uuid)
returns text
language sql stable
set search_path=public
as $$
  select lower(
    coalesce(m.subject,'') || ' ' ||
    regexp_replace(coalesce(m.body_text, ''), '\s+', ' ', 'g') || ' ' ||
    regexp_replace(coalesce(m.body_html, ''), '<[^>]+>', ' ', 'g')
  )
  from public.inbox_messages m
  where m.id = p_msg
$$;

-- =====================================================
-- C) Detector: sets opted_out_at on the lead, cancels future queue
-- =====================================================
create or replace function public.detect_opt_out_on_message(p_message uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_text text;
  v_user uuid;
  v_lead uuid;
  v_campaign uuid;
  v_thread_id uuid;
  v_hit boolean := false;
begin
  -- Only consider inbound messages
  select m.user_id, m.lead_id, m.campaign_id, 
         -- Try to find thread_id from various possible sources
         (select id from public.inbox_threads t 
          where (t.lead_id = m.lead_id and t.campaign_id = m.campaign_id) 
          limit 1) as thread_id
    into v_user, v_lead, v_campaign, v_thread_id
  from public.inbox_messages m
  where m.id = p_message
    and m.direction = 'in';

  if v_user is null or v_lead is null then
    return false;
  end if;

  v_text := public._normalize_msg_text(p_message);

  -- Check user-specific phrases first, then global
  if exists (
    select 1 from public.opt_out_keywords k
    where k.user_id = v_user and v_text like '%' || lower(k.phrase) || '%'
  ) then
    v_hit := true;
  elsif exists (
    select 1 from public.opt_out_keywords k
    where k.user_id is null and v_text like '%' || lower(k.phrase) || '%'
  ) then
    v_hit := true;
  end if;

  if not v_hit then
    return false;
  end if;

  -- Mark the lead as opted out (check both leads and campaign_leads)
  -- First try campaign_leads (if it exists and has the lead)
  begin
    update public.campaign_leads
       set opted_out_at = coalesce(opted_out_at, now())
     where id = v_lead;
  exception when undefined_table then
    null;
  end;

  -- Also try leads table (if it exists and has opted_out_at)
  begin
    update public.leads
       set opted_out_at = coalesce(opted_out_at, now())
     where id = v_lead;
  exception when undefined_table or undefined_column then
    null;
  end;

  -- Stop this thread/campaign follow-ups (if thread exists)
  if v_thread_id is not null then
    begin
      update public.inbox_threads
         set stopped_by_reply = true,
             updated_at = now()
       where id = v_thread_id;
    exception when undefined_table then
      null;
    end;

    -- Cancel any future queued/sending items for this thread/lead
    begin
      perform public.cancel_future_queue_for_thread(v_thread_id);
    exception when undefined_function then
      -- Fallback: cancel by lead/campaign
      update public.send_queue
         set status = 'canceled'
       where lead_id = v_lead
         and (campaign_id = v_campaign or v_campaign is null)
         and status in ('queued','sending','pending');
    end;
  else
    -- No thread, but still cancel by lead/campaign
    begin
      update public.send_queue
         set status = 'canceled'
       where lead_id = v_lead
         and (campaign_id = v_campaign or v_campaign is null)
         and status in ('queued','sending','pending');
    exception when undefined_table then
      null;
    end;
  end if;

  return true;
end $$;

-- =====================================================
-- D) Trigger on inbound message insert
-- =====================================================
create or replace function public.trg_inbound_optout()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.direction = 'in' then
    perform public.detect_opt_out_on_message(new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_inbox_messages_optout on public.inbox_messages;
create trigger trg_inbox_messages_optout
after insert on public.inbox_messages
for each row execute function public.trg_inbound_optout();

-- =====================================================
-- E) RLS: owners/readers may read, owners/editors may write keywords
-- =====================================================
alter table public.opt_out_keywords enable row level security;

drop policy if exists "keywords_read" on public.opt_out_keywords;
create policy "keywords_read"
on public.opt_out_keywords
for select
using (
  user_id is null
  or user_id = auth.uid()
);

drop policy if exists "keywords_write" on public.opt_out_keywords;
create policy "keywords_write"
on public.opt_out_keywords
for all
using (user_id = auth.uid() or user_id is null)
with check (coalesce(user_id, auth.uid()) = auth.uid());

-- =====================================================
-- F) Backfill function: scan recent messages
-- =====================================================
create or replace function public.backfill_opt_outs(p_days int default 30)
returns int
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count int := 0;
  rec record;
begin
  for rec in
    select m.id
    from public.inbox_messages m
    where m.direction = 'in'
      and m.received_at >= now() - (p_days || ' days')::interval
  loop
    if public.detect_opt_out_on_message(rec.id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

grant execute on function public.backfill_opt_outs(int) to authenticated;
grant execute on function public.detect_opt_out_on_message(uuid) to service_role;
grant execute on function public._normalize_msg_text(uuid) to service_role;

