-- =========================================================
-- BLOCK 282000 — SmartSend Sales Execution Engine v1
-- “Turn Product Into Paying Customers”
--
-- Internal-only sales execution (no CRM bloat):
-- - Log sales leads
-- - Track status (prospect → demo_booked → trial → paid / lost)
-- - Allow admin tooling to book demos / start trials
-- - Auto-mark paid on subscription start (handled in app webhooks)
-- =========================================================

create table if not exists public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  owner_name text,
  email text,
  phone text,
  city text,
  state text,
  source text not null check (source in ('cold_email', 'referral', 'inbound')),
  status text not null default 'prospect' check (status in ('prospect', 'demo_booked', 'trial', 'paid', 'lost')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_leads_status_idx on public.sales_leads(status);
create index if not exists sales_leads_created_at_idx on public.sales_leads(created_at desc);
create index if not exists sales_leads_email_idx on public.sales_leads((lower(email)));

alter table public.sales_leads enable row level security;

-- Internal-only: no direct authenticated access. Service role only (admin UI uses server-side service role).
drop policy if exists "service_role can manage sales_leads" on public.sales_leads;
create policy "service_role can manage sales_leads"
  on public.sales_leads
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.set_sales_leads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sales_leads_updated_at on public.sales_leads;
create trigger trg_sales_leads_updated_at
before update on public.sales_leads
for each row
execute function public.set_sales_leads_updated_at();









