-- Adaptive Reply Brain System Migration
-- Schema, enums, tables, RLS, triggers, and RPC functions

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

create type public.reply_intent as enum (
  'none',
  'out_of_office',
  'positive',
  'neutral',
  'negative',
  'unsubscribe',
  'spam',
  'bounce',
  'question',
  'meeting_interest'
);

create type public.reply_action as enum (
  'ignore',
  'archive',
  'auto_unsubscribe',
  'create_task',
  'schedule_meeting',
  'send_followup_a',
  'send_followup_b',
  'route_to_human',
  'mark_bounce'
);

-- ============================================================================
-- 2. PER-ACCOUNT MODEL/PROMPT VERSIONING
-- ============================================================================

create table if not exists public.reply_brain_models (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  version int not null default 1,
  name text not null default 'default',
  system_prompt text not null,
  temperature real not null default 0.2,
  top_p real not null default 1.0,
  is_active boolean not null default true
);

create index if not exists idx_reply_brain_models_account_active 
  on public.reply_brain_models(account_id, is_active);

-- ============================================================================
-- 3. INFERENCE LOG
-- ============================================================================

create table if not exists public.reply_brain_inferences (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  model_id uuid not null references public.reply_brain_models(id) on delete restrict,
  email_id uuid not null references public.emails(id) on delete cascade,
  message_id text, -- provider message id
  inputs jsonb not null,        -- {subject,body,thread_context,lead,campaign}
  output jsonb not null,        -- raw model JSON
  intent reply_intent not null,
  action reply_action not null,
  confidence real not null check (confidence between 0 and 1),
  score real,                   -- optional aggregate score
  latency_ms int
);

create index if not exists idx_reply_brain_inferences_account 
  on public.reply_brain_inferences(account_id, created_at desc);
create index if not exists idx_reply_brain_inferences_email 
  on public.reply_brain_inferences(email_id);
create index if not exists idx_reply_brain_inferences_intent_action 
  on public.reply_brain_inferences(intent, action);

-- ============================================================================
-- 4. HUMAN FEEDBACK
-- ============================================================================

create table if not exists public.reply_brain_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  inference_id uuid not null references public.reply_brain_inferences(id) on delete cascade,
  correct_intent reply_intent,
  correct_action reply_action,
  note text,
  user_id uuid references auth.users(id) on delete set null
);

create index if not exists idx_reply_brain_feedback_inference 
  on public.reply_brain_feedback(inference_id);
create index if not exists idx_reply_brain_feedback_account 
  on public.reply_brain_feedback(account_id);

-- ============================================================================
-- 5. PER-TENANT THRESHOLDS/POLICY
-- ============================================================================

create table if not exists public.reply_brain_policy (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  min_confidence real not null default 0.65,
  auto_actions reply_action[] not null default ARRAY['auto_unsubscribe','send_followup_a','send_followup_b','mark_bounce']::reply_action[],
  route_actions reply_action[] not null default ARRAY['schedule_meeting','create_task','route_to_human']::reply_action[]
);

-- ============================================================================
-- 6. LIGHTWEIGHT QUEUE (DECOUPLES EMAIL INGEST → INFERENCE)
-- ============================================================================

create table if not exists public.brain_queue (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  attempt int not null default 0,
  run_after timestamptz not null default now(),
  email_id uuid not null references public.emails(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','done','dead')),
  last_error text
);

create index if not exists idx_brain_queue_status_run_after 
  on public.brain_queue(status, run_after) 
  where status = 'queued';
create index if not exists idx_brain_queue_email 
  on public.brain_queue(email_id);
create index if not exists idx_brain_queue_account 
  on public.brain_queue(account_id);

-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================================================

alter table public.reply_brain_models enable row level security;
alter table public.reply_brain_inferences enable row level security;
alter table public.reply_brain_feedback enable row level security;
alter table public.reply_brain_policy enable row level security;
alter table public.brain_queue enable row level security;

-- Models: account can read/write its models
drop policy if exists "account can read/write its models" on public.reply_brain_models;
create policy "account can read/write its models"
  on public.reply_brain_models
  using (account_id = auth.uid()) 
  with check (account_id = auth.uid());

-- Inferences: account can read its inferences
drop policy if exists "account can read its inferences" on public.reply_brain_inferences;
create policy "account can read its inferences"
  on public.reply_brain_inferences for select
  using (account_id = auth.uid());

-- Feedback: account can insert feedback
drop policy if exists "account insert feedback" on public.reply_brain_feedback;
create policy "account insert feedback"
  on public.reply_brain_feedback for insert
  with check (account_id = auth.uid());

-- Policy: account can read its policy
drop policy if exists "account read its policy" on public.reply_brain_policy;
create policy "account read its policy"
  on public.reply_brain_policy for select 
  using (account_id = auth.uid());

-- Queue: account can manage its queue
drop policy if exists "account manage its queue" on public.brain_queue;
create policy "account manage its queue"
  on public.brain_queue
  using (account_id = auth.uid()) 
  with check (account_id = auth.uid());

-- ============================================================================
-- 8. TRIGGER: AUTO-ENQUEUE ON INBOUND EMAIL INSERT
-- ============================================================================

create or replace function public.enqueue_brain_on_inbound()
returns trigger language plpgsql as $$
declare
  v_account_id uuid;
begin
  -- Check if direction is inbound (supports both 'inbound' and 'in' formats)
  if new.direction in ('inbound', 'in') then
    -- Try to get account_id from emails table directly
    if new.account_id is not null then
      v_account_id := new.account_id;
    -- Otherwise, derive from campaign
    elsif new.campaign_id is not null then
      select account_id into v_account_id
      from public.campaigns
      where id = new.campaign_id;
    -- Or from user_id (if accounts table links to users)
    elsif new.user_id is not null then
      select id into v_account_id
      from public.accounts
      where id = new.user_id
      limit 1;
    end if;
    
    -- Only enqueue if we found an account_id
    if v_account_id is not null then
      insert into public.brain_queue (email_id, account_id) 
      values (new.id, v_account_id);
    end if;
  end if;
  return new;
end$$;

drop trigger if exists trg_enqueue_brain on public.emails;
create trigger trg_enqueue_brain
after insert on public.emails
for each row execute function public.enqueue_brain_on_inbound();

-- ============================================================================
-- 9. RPC HELPER FUNCTIONS
-- ============================================================================

-- Unsubscribe lead by email_id
create or replace function public.unsubscribe_lead_by_email_id(p_email_id uuid)
returns void language plpgsql security definer as $$
declare v_lead_id uuid;
begin
  select lead_id into v_lead_id from public.emails where id = p_email_id;
  if v_lead_id is not null then
    update public.leads 
    set unsubscribed = true, 
        unsubscribed_at = now()
    where id = v_lead_id;
  end if;
end$$;

-- Mark bounce by email_id
create or replace function public.mark_bounce_by_email_id(p_email_id uuid)
returns void language plpgsql security definer as $$
declare v_lead_id uuid;
begin
  select lead_id into v_lead_id from public.emails where id = p_email_id;
  if v_lead_id is not null then
    update public.leads 
    set bounced = true, 
        bounced_at = now()
    where id = v_lead_id;
  end if;
end$$;

-- Create meeting task from inference
create or replace function public.create_meeting_task_from_inference(p_inference_id uuid)
returns void language plpgsql security definer as $$
declare r record;
begin
  select i.*, e.subject, e.lead_id, e.account_id into r
  from public.reply_brain_inferences i
  join public.emails e on e.id = i.email_id
  where i.id = p_inference_id;

  -- Insert into tasks table (adjust table name/columns as needed)
  -- This assumes a tasks table exists; if not, create it or adjust accordingly
  if exists (select 1 from information_schema.tables where table_name = 'tasks') then
    insert into public.tasks (account_id, lead_id, kind, title, payload)
    values (
      r.account_id, 
      r.lead_id, 
      'meeting', 
      'Schedule meeting from reply', 
      jsonb_build_object('inference_id', r.id, 'email_subject', r.subject)
    );
  end if;
end$$;

-- Queue followup from inference
create or replace function public.queue_followup_from_inference(p_inference_id uuid, p_variant text)
returns void language plpgsql security definer as $$
declare r record;
begin
  select i.*, e.subject, e.lead_id, e.account_id, e.campaign_id into r
  from public.reply_brain_inferences i
  join public.emails e on e.id = i.email_id
  where i.id = p_inference_id;

  -- Integrate with your existing send_queue or followup system
  -- This is a placeholder - adjust based on your actual followup queue structure
  if exists (select 1 from information_schema.tables where table_name = 'send_queue') then
    -- Example: insert into send_queue with appropriate template based on p_variant
    -- Adjust columns and logic based on your actual schema
    null; -- placeholder - implement based on your followup system
  end if;
end$$;

-- ============================================================================
-- 10. SEED DEFAULT MODEL FOR EXISTING ACCOUNTS
-- ============================================================================

insert into public.reply_brain_models (account_id, name, version, system_prompt, is_active)
select 
  a.id, 
  'default', 
  1, 
  $$
You are SmartSend's Adaptive Reply Brain. Classify inbound outreach replies and recommend the single best next action.

Definitions:
- meeting_interest: expresses desire to talk/meet, time windows, or asks for calendar link.
- positive: interested but not scheduling yet; might ask a question.
- unsubscribe: explicit opt-out (stop emailing) or strong implication ("remove me").
- bounce: delivery failure content.

Actions mapping rules:
- unsubscribe -> auto_unsubscribe
- bounce -> mark_bounce
- meeting_interest & confident -> schedule_meeting
- positive -> send_followup_a
- neutral/negative -> route_to_human
- spam -> archive

Output strict JSON: {intent, action, confidence, reason, suggested_reply?, meeting?, entities?}
$$, 
  true
from public.accounts a
where not exists (
  select 1 from public.reply_brain_models rbm 
  where rbm.account_id = a.id and rbm.name = 'default' and rbm.is_active = true
);

