-- Replies Inbox System
-- Adds assigned_to, status to replies table
-- Adds owner_id to leads table for team workflows

-- 1. Add assigned_to and status to replies table
alter table replies add column if not exists assigned_to uuid references auth.users(id);
alter table replies add column if not exists status text check (status in ('Open','Closed','Ignored')) default 'Open';
create index if not exists idx_replies_status on replies(status);
create index if not exists idx_replies_assigned_to on replies(assigned_to);

-- 2. Add project_id to replies if it doesn't exist (needed for filtering)
alter table replies add column if not exists project_id uuid;
create index if not exists idx_replies_project_id on replies(project_id);

-- Update existing replies with project_id from leads
update replies r
set project_id = l.project_id
from leads l
where r.lead_id = l.id and r.project_id is null;

-- Also try org_id and workspace_id as fallback
update replies r
set project_id = coalesce(l.project_id, l.org_id, l.workspace_id)
from leads l
where r.lead_id = l.id and r.project_id is null;

-- 3. Add owner_id to leads for team workflows
alter table leads add column if not exists owner_id uuid references auth.users(id);
create index if not exists idx_leads_owner_id on leads(owner_id);

-- 4. Optional: Auto-assign trigger function
create or replace function assign_reply_to_lead_owner()
returns trigger as $$
begin
  update replies set assigned_to = (select owner_id from leads where id = new.lead_id)
  where id = new.id and assigned_to is null;
  return new;
end;
$$ language plpgsql;

create trigger if not exists trg_assign_reply
after insert on replies
for each row execute function assign_reply_to_lead_owner();

-- 5. Add body column to replies if it doesn't exist (needed for search)
alter table replies add column if not exists body text;

-- 6. Add received_at column if it doesn't exist (needed for sorting)
alter table replies add column if not exists received_at timestamptz default now();

-- Update existing rows
update replies set received_at = created_at where received_at is null;

