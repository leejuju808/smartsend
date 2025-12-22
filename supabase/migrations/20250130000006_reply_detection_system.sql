-- Reply Detection and Classification System
-- Step 1: DB Schema - Reply status, stop reason, audit
-- Per campaign-contact lifecycle

alter table public.campaign_contacts
  add column if not exists replied_at timestamptz,
  add column if not exists reply_confidence numeric,              -- 0..1 from classifier
  add column if not exists stop_reason text
    check (stop_reason in ('replied','meeting','unsubscribe','bounce','manual','complaint','invalid')),
  add column if not exists last_reply_kind text
    check (last_reply_kind in ('positive','neutral','negative','meeting','unsubscribe','bounce','ooo','other'));

-- Create indexes for efficient queries
create index if not exists idx_campaign_contacts_replied on public.campaign_contacts(replied_at) where replied_at is not null;
create index if not exists idx_campaign_contacts_stop_reason on public.campaign_contacts(stop_reason) where stop_reason is not null;

-- Unschedule helper: mark all future sends canceled
alter table public.scheduled_messages
  add column if not exists canceled_at timestamptz,
  add column if not exists cancel_reason text
    check (cancel_reason in ('replied','unsubscribe','bounce','manual'));

-- Also add to send_queue if it exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'send_queue') then
    alter table public.send_queue
      add column if not exists canceled_at timestamptz,
      add column if not exists cancel_reason text
        check (cancel_reason in ('replied','unsubscribe','bounce','manual'));
    
    create index if not exists idx_send_queue_canceled on public.send_queue(canceled_at) where canceled_at is not null;
  end if;
end $$;

-- Create index for canceled scheduled messages
create index if not exists idx_scheduled_messages_canceled on public.scheduled_messages(canceled_at) where canceled_at is not null;

-- Step 2: Classifier output contract (single source of truth)
-- Note: contact_id may need to be resolved via campaign_contacts join if not on replies directly
create table if not exists public.reply_classifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reply_id uuid not null references public.replies(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  kind text not null check (kind in ('positive','neutral','negative','meeting','unsubscribe','bounce','ooo','other')),
  is_real_reply boolean not null,           -- true = human or meaningful auto-reply (not noise)
  confidence numeric not null,              -- 0..1
  model text not null,                      -- 'v1-rules', 'gpt4o-mini', etc.
  version text not null,                    -- your model/pack version (tie into Day 25)
  notes text
);

create unique index if not exists ux_reply_classifications_reply on public.reply_classifications(reply_id);
create index if not exists idx_reply_classifications_campaign on public.reply_classifications(campaign_id, contact_id);
create index if not exists idx_reply_classifications_kind on public.reply_classifications(kind);
create index if not exists idx_reply_classifications_created on public.reply_classifications(created_at desc);

-- RLS for reply_classifications
alter table public.reply_classifications enable row level security;

create policy if not exists "reply_classifications_select_own" on public.reply_classifications
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = reply_classifications.campaign_id 
        and (c.user_id = auth.uid() or exists (
          select 1 from public.campaign_contacts cc
          where cc.campaign_id = c.id 
            and cc.contact_id = reply_classifications.contact_id
        ))
    )
  );

create policy if not exists "reply_classifications_service_rw" on public.reply_classifications
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Step 3: Helper RPC (Postgres) - Cancel future sends for a contact
create or replace function public.cancel_future_sends_for_contact(
  p_campaign_id uuid, 
  p_contact_id uuid, 
  p_reason text
)
returns void 
language plpgsql 
security definer 
as $$
begin
  -- Cancel scheduled_messages (only those not yet sent)
  update public.scheduled_messages
  set canceled_at = now(), cancel_reason = p_reason
  where campaign_id = p_campaign_id
    and contact_id = p_contact_id
    and canceled_at is null
    and (status is null or status != 'sent');
  
  -- Also cancel send_queue if it exists (only those not yet sent)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'send_queue') then
    update public.send_queue
    set canceled_at = now(), cancel_reason = p_reason
    where campaign_id = p_campaign_id
      and contact_id = p_contact_id
      and canceled_at is null
      and (state is null or state != 'sent');
  end if;
end $$;

-- Step 6: Campaign settings for reply detection
alter table public.campaigns
  add column if not exists reply_auto_mark boolean default true,
  add column if not exists reply_confidence_min numeric default 0.70, -- under flows to "Needs review"
  add column if not exists reply_shadow_mode boolean default false;    -- log but do NOT stop sequence

-- Step 7: Analytics glue - Extend message_outcomes with reply_kind and reply_confidence
alter table public.message_outcomes
  add column if not exists reply_kind text,
  add column if not exists reply_confidence numeric;

create index if not exists idx_message_outcomes_reply_kind on public.message_outcomes(reply_kind) where reply_kind is not null;

