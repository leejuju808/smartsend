-- Inbound Email Polling System
-- Adds checkpoints to connected_accounts and extends email_events for inbound tracking

-- 1. Add checkpoint columns to connected_accounts
alter table public.connected_accounts
  add column if not exists gmail_history_id text,     -- Gmail "historyId" checkpoint
  add column if not exists ms_delta_link text;        -- Graph deltaLink checkpoint

-- 2. Add fields to email_events for inbound tracking
-- First, check if email_events has direction column, if not add it
alter table public.email_events
  add column if not exists thread_id uuid references public.lead_threads(id) on delete set null,
  add column if not exists provider_msg_id text,
  add column if not exists subject text,
  add column if not exists snippet text,
  add column if not exists from_email text,
  add column if not exists to_email text,
  add column if not exists direction text check (direction in ('inbound','outbound'));

-- 3. Create indexes for performance
create index if not exists idx_email_events_thread on public.email_events(thread_id);
create index if not exists idx_lead_threads_campaign on public.lead_threads(campaign_id);
create index if not exists idx_campaign_leads_email on public.campaign_leads(email);
create index if not exists idx_email_events_provider_msg_id on public.email_events(provider_msg_id);
create index if not exists idx_email_events_direction on public.email_events(direction);

-- 4. Create find_or_create_thread function
create or replace function public.find_or_create_thread(
  p_owner uuid,           -- mailbox owner
  p_from_email text,      -- who replied
  p_to_email text,        -- our sending address
  p_subject text
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_lead uuid;
  v_campaign uuid;
  v_thread uuid;
begin
  -- Find a lead owned by this user who has this "from_email"
  select l.id, l.campaign_id
    into v_lead, v_campaign
  from public.campaign_leads l
  join public.campaigns c on c.id = l.campaign_id
  where c.user_id = p_owner
    and lower(l.email) = lower(p_from_email)
  order by l.updated_at desc nulls last
  limit 1;

  if v_lead is null then
    -- If unknown, try fallback: most recent campaign for owner
    select id into v_campaign
    from public.campaigns
    where user_id = p_owner
    order by updated_at desc nulls last, created_at desc
    limit 1;
  end if;

  -- Existing thread?
  select id into v_thread
  from public.lead_threads
  where (lead_id = v_lead and campaign_id = v_campaign)
  order by updated_at desc
  limit 1;

  if v_thread is null then
    insert into public.lead_threads(id, campaign_id, lead_id, subject, status, last_message_at, updated_at)
    values (gen_random_uuid(), v_campaign, v_lead, coalesce(p_subject,'(no subject)'), 'open', now(), now())
    returning id into v_thread;
  else
    update public.lead_threads
       set subject = coalesce(subject, p_subject),
           updated_at = now()
     where id = v_thread;
  end if;

  return v_thread;
end;
$$;

-- 5. Grant permissions
revoke all on function public.find_or_create_thread(uuid, text, text, text) from public;
grant execute on function public.find_or_create_thread(uuid, text, text, text) to service_role;

