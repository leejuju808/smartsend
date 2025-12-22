-- Meeting Suggestions and Tasks System
-- Creates tables and triggers for meeting scheduling workflow

-- ============================================================================
-- 1. MEETING SUGGESTIONS TABLE
-- ============================================================================

create table if not exists public.meeting_suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email_id uuid not null references public.emails(id) on delete cascade,
  source text not null check (source in ('llm','link_detect','pattern')),
  link text,                       -- calendly/cal.com/etc
  timezone text,                   -- e.g. "America/Los_Angeles"
  proposed_times jsonb,            -- ["2025-11-14T17:00:00Z", ...]
  confidence real not null default 0.7,
  note text
);

create index if not exists idx_meeting_suggestions_email 
  on public.meeting_suggestions(email_id);
create index if not exists idx_meeting_suggestions_account 
  on public.meeting_suggestions(account_id, created_at desc);

alter table public.meeting_suggestions enable row level security;

create policy "acct can read/write its meeting suggestions"
  on public.meeting_suggestions
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

-- ============================================================================
-- 2. TASKS TABLE
-- ============================================================================

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  kind text not null check (kind in ('meeting','followup','todo')),
  title text not null,
  status text not null default 'open' check (status in ('open','done','archived')),
  payload jsonb
);

create index if not exists idx_tasks_account 
  on public.tasks(account_id, created_at desc);
create index if not exists idx_tasks_lead 
  on public.tasks(lead_id);
create index if not exists idx_tasks_status 
  on public.tasks(status) where status = 'open';

alter table public.tasks enable row level security;

create policy "acct can manage tasks"
  on public.tasks 
  using (account_id = auth.uid()) 
  with check (account_id = auth.uid());

-- ============================================================================
-- 3. TRIGGER: SEED MEETING TASK FROM BRAIN INFERENCE
-- ============================================================================

create or replace function public.seed_meeting_task_from_brain()
returns trigger language plpgsql as $$
declare 
  v_lead uuid; 
  v_acct uuid; 
  v_payload jsonb;
begin
  if new.intent = 'meeting_interest' and new.confidence >= 0.60 then
    select e.account_id, e.lead_id into v_acct, v_lead 
    from public.emails e 
    where e.id = new.email_id;

    -- Only create task if we found account_id
    if v_acct is not null then
      insert into public.tasks (account_id, lead_id, kind, title, payload)
      values (
        v_acct, 
        v_lead, 
        'meeting', 
        'Schedule meeting — reply indicated interest',
        jsonb_build_object('email_id', new.email_id, 'inference_id', new.id)
      );
    end if;
  end if;
  return new;
end$$;

drop trigger if exists trg_seed_meeting_task on public.reply_brain_inferences;
create trigger trg_seed_meeting_task
after insert on public.reply_brain_inferences
for each row execute function public.seed_meeting_task_from_brain();

-- ============================================================================
-- 4. FUNCTION: CALL MEETING EXTRACT EDGE FUNCTION
-- ============================================================================

-- Note: This uses pg_net extension if available, otherwise falls back to 
-- calling from application layer after inference insert
create or replace function public.call_meeting_extract(email uuid)
returns void language plpgsql security definer as $$
declare
  v_functions_url text;
  v_service_key text;
begin
  -- Get function URL and service key from settings (or use defaults)
  v_functions_url := current_setting('app.functions_url', true);
  v_service_key := current_setting('app.service_role', true);
  
  -- If pg_net is available, use it; otherwise this will be called from app layer
  if v_functions_url is not null and v_service_key is not null then
    -- Using pg_net extension (if installed)
    perform net.http_post(
      url := v_functions_url || '/meeting-extract',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_service_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('email_id', email)
    );
  end if;
end$$;

-- ============================================================================
-- 5. TRIGGER: CALL MEETING EXTRACT AFTER BRAIN INFERENCE
-- ============================================================================

create or replace function public.trigger_meeting_extract()
returns trigger language plpgsql as $$
begin
  -- Trigger extraction for meeting interest, questions, or positive replies
  -- that might contain scheduling information
  if new.intent in ('meeting_interest','question','positive') then
    -- Call edge function (or queue for app layer to call)
    perform public.call_meeting_extract(new.email_id);
  end if;
  return new;
end$$;

drop trigger if exists trg_meeting_extract on public.reply_brain_inferences;
create trigger trg_meeting_extract
after insert on public.reply_brain_inferences
for each row execute function public.trigger_meeting_extract();















