-- Richer Suppression System
-- Adds kind, source, details, created_by columns and fast lookup index

alter table public.suppress_list
  add column if not exists kind text check (kind in ('bounce','unsubscribe','manual')) default 'bounce',
  add column if not exists source text,               -- 'gmail-dsn','reply','ui'
  add column if not exists details jsonb,            -- raw bits we parsed (status code, smtp host, etc.)
  add column if not exists created_by uuid;          -- who/what added it

-- Add project_id/org_id support if missing (for multi-tenant)
do $$
begin
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'suppress_list' and column_name = 'project_id') then
    alter table public.suppress_list add column project_id uuid;
  end if;
  
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'suppress_list' and column_name = 'org_id') then
    alter table public.suppress_list add column org_id uuid;
  end if;
end $$;

-- Fast lookup index for case-insensitive email lookups
create index if not exists idx_suppress_lower_email on public.suppress_list(lower(email));

-- Update unique constraint to handle project_id/org_id if needed
-- Keep existing workspace_id unique constraint if it exists
do $$
begin
  -- If project_id exists but no unique constraint, add one
  if exists (select 1 from information_schema.columns 
             where table_name = 'suppress_list' and column_name = 'project_id') then
    if not exists (select 1 from pg_constraint 
                   where conname = 'suppress_list_project_email_key' 
                   and conrelid = 'public.suppress_list'::regclass) then
      alter table public.suppress_list 
        add constraint suppress_list_project_email_key unique (project_id, email);
    end if;
  end if;
  
  -- If org_id exists but no unique constraint, add one  
  if exists (select 1 from information_schema.columns 
             where table_name = 'suppress_list' and column_name = 'org_id') then
    if not exists (select 1 from pg_constraint 
                   where conname = 'suppress_list_org_email_key' 
                   and conrelid = 'public.suppress_list'::regclass) then
      alter table public.suppress_list 
        add constraint suppress_list_org_email_key unique (org_id, email);
    end if;
  end if;
end $$;

