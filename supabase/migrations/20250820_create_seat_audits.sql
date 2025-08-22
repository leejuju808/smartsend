create table if not exists public.seat_audits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  actor_id uuid not null references auth.users (id) on delete cascade,
  type text not null, -- upgrade_quantity | remove
  delta integer not null,
  old_qty integer not null,
  new_qty integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_seat_audits_org_time on public.seat_audits (org_id, created_at desc);
comment on table public.seat_audits is 'Quantitative seat changes over time';
