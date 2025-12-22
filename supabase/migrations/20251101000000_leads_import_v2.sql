-- Lead imports
create table if not exists lead_imports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  filename text,
  total_rows int,
  imported_rows int default 0,
  status text check (status in ('pending','validating','imported','error')) default 'pending',
  errors jsonb,
  created_at timestamptz default now()
);

-- Validation log for preview UI
create table if not exists lead_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references lead_imports(id) on delete cascade,
  row_number int,
  email text,
  first_name text,
  last_name text,
  company text,
  custom jsonb,
  is_duplicate boolean default false,
  is_invalid boolean default false,
  reason text
);

create index if not exists idx_lead_import_rows_import on lead_import_rows(import_id);
create index if not exists idx_lead_imports_team on lead_imports(team_id);
create index if not exists idx_lead_imports_campaign on lead_imports(campaign_id);
create index if not exists idx_lead_imports_status on lead_imports(status);

-- Enable RLS
alter table lead_imports enable row level security;
alter table lead_import_rows enable row level security;

-- RLS Policies
create policy "Users can view their team imports"
  on lead_imports for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() 
      and p.team_id = lead_imports.team_id
    )
  );

create policy "Users can insert imports for their team"
  on lead_imports for insert
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and p.team_id = lead_imports.team_id
    )
  );

create policy "Users can view import rows for their team"
  on lead_import_rows for select
  using (
    exists (
      select 1 from lead_imports li
      join profiles p on p.team_id = li.team_id
      where li.id = lead_import_rows.import_id
      and p.id = auth.uid()
    )
  );

create policy "Service role can insert import rows"
  on lead_import_rows for insert
  with check (true);

