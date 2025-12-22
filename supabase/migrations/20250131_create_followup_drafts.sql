-- Create followup_drafts table
create table if not exists followup_drafts (
  id uuid primary key default gen_random_uuid(),
  reply_id uuid references email_replies(id) on delete cascade,
  workspace_id uuid not null,
  draft_subject text,
  draft_body text,
  status text default 'pending',  -- pending | approved | sent
  created_at timestamptz default now()
);

-- Enable row level security
alter table followup_drafts enable row level security;

-- Create policy for read, insert, update operations
create policy "allow read insert update" on followup_drafts for all using (true) with check (true);

-- Add indexes for better performance
create index if not exists idx_followup_drafts_reply_id on followup_drafts(reply_id);
create index if not exists idx_followup_drafts_workspace_id on followup_drafts(workspace_id);
create index if not exists idx_followup_drafts_status on followup_drafts(status);