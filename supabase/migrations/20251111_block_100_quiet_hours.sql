-- 1) Account-level preferences
do $$ begin
  alter table public.accounts add column if not exists timezone text default 'America/Los_Angeles';
  alter table public.accounts add column if not exists quiet_hours jsonb
    default jsonb_build_object('enabled', true, 'start', '20:00', 'end', '07:00'); -- 24h HH:MM
exception when duplicate_column then null; end $$;

-- 2) Per-ISP overrides (idempotent)
create table if not exists public.isp_quiet_overrides (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  isp_key text not null check (isp_key in ('gmail','outlook','yahoo','zoho','other')),
  enabled boolean not null default true,
  start_hhmm text not null default '20:00',
  end_hhmm   text not null default '07:00',
  unique (account_id, isp_key)
);

alter table public.isp_quiet_overrides enable row level security;

create policy ispqo_iso on public.isp_quiet_overrides
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

