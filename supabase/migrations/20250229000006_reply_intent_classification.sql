-- Per-message NLP labels

alter table email_messages
  add column if not exists intent text
    check (intent in ('interested','meeting','referral','not_now','unsubscribe','ooo','bounce','question','unknown')),
  add column if not exists intent_confidence numeric check (intent_confidence between 0 and 1),
  add column if not exists extracted_contacts jsonb,     -- e.g., {"name":"Sam","email":"sam@acme.com"}
  add column if not exists extracted_times jsonb,        -- e.g., [{"start":"2025-11-03T15:00:00Z","tz":"PST"}]
  add column if not exists follow_up_at timestamptz;

-- Thread rollups + routing

alter table email_threads
  add column if not exists last_intent text,
  add column if not exists status text
    check (status in ('open','waiting','closed','do_not_contact')) default 'open',
  add column if not exists owner_id uuid references profiles(id);

-- Lightweight rules for auto-actions (optional now, powerful later)

create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  match_intents text[] not null,                 -- e.g., {'interested','meeting'}
  action text not null check (action in ('assign','set_status','schedule_followup','add_tag')),
  action_payload jsonb,                          -- {"owner_id": "..."} or {"status":"waiting"} or {"days":3}
  is_enabled boolean not null default true,
  created_at timestamptz default now()
);

alter table automation_rules enable row level security;

create policy "tenant read rules" on automation_rules
for select using ((workspace_id = (current_setting('request.jwt.claims', true)::jsonb->>'workspace_id')::uuid));

create policy "service insert/update rules" on automation_rules
for all to service_role using (true) with check (true);

-- Indexes for performance
create index if not exists idx_email_messages_intent on email_messages(intent);
create index if not exists idx_email_messages_thread_intent on email_messages(thread_id, intent);
create index if not exists idx_email_threads_status on email_threads(status);
create index if not exists idx_email_threads_last_intent on email_threads(last_intent);
create index if not exists idx_email_threads_owner on email_threads(owner_id);
create index if not exists idx_automation_rules_workspace on automation_rules(workspace_id, is_enabled);

