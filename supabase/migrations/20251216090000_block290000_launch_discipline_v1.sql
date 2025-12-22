-- =========================================================
-- BLOCK 290000 — SmartSend Launch Discipline v1
-- “Execute or Die.”
--
-- Adds:
-- - execution_logs (mandatory daily log)
--
-- Notes:
-- - Internal-only. Service role manages rows (admin UI uses service role).
-- - Date is unique: one row per day.
-- =========================================================

create table if not exists public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  emails_sent int not null default 0,
  demos_booked int not null default 0,
  trials_started int not null default 0,
  paid_conversions int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_execution_logs_date_desc on public.execution_logs(date desc);

alter table public.execution_logs enable row level security;

drop policy if exists "service_role can manage execution_logs" on public.execution_logs;
create policy "service_role can manage execution_logs"
  on public.execution_logs
  for all
  to service_role
  using (true)
  with check (true);









