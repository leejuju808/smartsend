-- Helpful indexes + constraints for fast upserts
create index if not exists ix_leads_ws_email on public.leads (workspace_id, email);
alter table if exists public.leads
  add constraint if not exists leads_email_chk check (position('@' in email) > 1);

-- Add workspace_id if not exists
alter table if exists public.leads
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- Add unique constraint for workspace + email
create unique index if not exists ix_leads_workspace_email_unique 
  on public.leads (workspace_id, lower(email)); 