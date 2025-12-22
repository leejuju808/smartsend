-- Block 300 — Adaptive Reply Brain v2
-- Reply Intent Classification System

-- Create reply_intent table for AI classification results
create table if not exists reply_intent (
  id uuid primary key default gen_random_uuid(),
  
  reply_id uuid not null references email_replies(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete set null,
  
  category text,                 -- e.g., "meeting", "positive", "negative", "unsubscribe"
  sentiment text,                -- "positive" | "neutral" | "negative"
  intent_score integer,          -- 0–100
  meeting_time timestamptz,      -- if extracted
  meeting_timezone text,
  meeting_location text,
  meeting_link text,
  
  objection_type text,           -- "price", "timing", "not_interested", "competitor", "follow_up_later"
  
  extracted jsonb,               -- raw extracted JSON from the LLM
  created_at timestamptz default now()
);

-- Indexes for efficient querying
create index if not exists idx_reply_intent_reply_id on reply_intent (reply_id);
create index if not exists idx_reply_intent_workspace_id on reply_intent (workspace_id);
create index if not exists idx_reply_intent_category on reply_intent (category);
create index if not exists idx_reply_intent_sentiment on reply_intent (sentiment);
create index if not exists idx_reply_intent_intent_score on reply_intent (intent_score);
create index if not exists idx_reply_intent_created_at on reply_intent (created_at desc);

-- Enable RLS
alter table reply_intent enable row level security;

-- RLS Policies: Service role can manage all intents
drop policy if exists "Service can manage reply_intent" on reply_intent;
create policy "Service can manage reply_intent" on reply_intent
  for all using (true) with check (true);

-- RLS Policies: Users can view intents for their workspace
drop policy if exists "Users can view reply_intent" on reply_intent;
create policy "Users can view reply_intent" on reply_intent
  for select using (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = reply_intent.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Helper function to get workspace_id from email_replies
-- Gets workspace_id via email_logs -> user_id -> workspace_members
create or replace function get_workspace_from_reply(p_reply_id uuid)
returns uuid
language sql
stable
as $$
  select wm.workspace_id
  from email_replies er
  join email_logs el on el.id = er.email_log_id
  join workspace_members wm on wm.user_id = el.user_id
  where er.id = p_reply_id
  limit 1
$$;

-- Trigger to auto-populate workspace_id from email_logs
create or replace function set_reply_intent_workspace_id()
returns trigger
language plpgsql
as $$
begin
  if new.workspace_id is null then
    new.workspace_id := get_workspace_from_reply(new.reply_id);
  end if;
  return new;
end;
$$;

create trigger set_reply_intent_workspace_id_trigger
  before insert on reply_intent
  for each row
  execute function set_reply_intent_workspace_id();

