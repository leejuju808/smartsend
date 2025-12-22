-- audit log
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,              -- e.g., 'sequence.create', 'lead.import', 'billing.upgrade'
  target_type text,                  -- 'sequence','lead','enrollment','job','org','user'
  target_id text,
  meta jsonb,                        -- extra context
  created_at timestamptz default now()
);
create index if not exists idx_audit_org_time on audit_logs(org_id, created_at desc);

-- RLS: org members can read; anyone who can write to the org can insert
alter table audit_logs enable row level security;

create or replace function is_org_member(oid uuid, uid uuid)
returns boolean language sql stable as $$
  select exists(select 1 from org_members m where m.org_id = oid and m.user_id = uid)
$$;

drop policy if exists audit_read on audit_logs;
create policy audit_read on audit_logs
for select using ( is_org_member(org_id, auth.uid()) );

drop policy if exists audit_insert on audit_logs
for insert with check ( is_org_member(org_id, auth.uid()) );