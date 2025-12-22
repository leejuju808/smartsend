-- AI Follow-up Queue: Store AI-generated follow-up email drafts
create table if not exists ai_followup_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  thread_id uuid not null references threads(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  scheduled_for timestamptz not null,
  ai_prompt text,
  ai_draft text,
  status text not null default 'pending', -- pending | approved | sent | skipped
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for efficient queries
create index if not exists idx_ai_followup_queue_thread on ai_followup_queue(thread_id);
create index if not exists idx_ai_followup_queue_status on ai_followup_queue(status);
create index if not exists idx_ai_followup_queue_scheduled on ai_followup_queue(scheduled_for);
create index if not exists idx_ai_followup_queue_org on ai_followup_queue(org_id);

-- RLS policies
alter table ai_followup_queue enable row level security;

drop policy if exists "read followups by org" on ai_followup_queue;
create policy "read followups by org" on ai_followup_queue
  for select using (
    org_id = (select org_id from profiles p where p.id = auth.uid())
  );

drop policy if exists "insert followups by org" on ai_followup_queue;
create policy "insert followups by org" on ai_followup_queue
  for insert with check (
    org_id = (select org_id from profiles p where p.id = auth.uid())
  );

drop policy if exists "update followups by org" on ai_followup_queue;
create policy "update followups by org" on ai_followup_queue
  for update using (
    org_id = (select org_id from profiles p where p.id = auth.uid())
  );

