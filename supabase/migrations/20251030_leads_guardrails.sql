-- Ensure one lead per email per workspace
create unique index if not exists leads_workspace_email_uidx
  on public.leads (workspace_id, lower(email));

-- Helpful status default
alter table public.leads
  alter column status set default 'new';


