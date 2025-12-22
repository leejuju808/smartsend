-- Create org_revenue table for tracking MRR, ARR, and churn metrics
create table if not exists public.org_revenue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  mrr numeric default 0,
  arr numeric default 0,
  churn_rate numeric default 0,
  last_sync timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create indexes for performance
create index if not exists idx_org_revenue_org_id on public.org_revenue(org_id);
create index if not exists idx_org_revenue_last_sync on public.org_revenue(last_sync);

-- Enable RLS
alter table public.org_revenue enable row level security;

-- RLS policies - org members can view revenue data
create policy "org_revenue_select_member" on public.org_revenue
  for select using (
    exists (
      select 1 from public.org_members m
      where m.org_id = org_revenue.org_id and m.user_id = auth.uid()
    )
  );

-- Only service role can insert/update (via webhooks)
create policy "org_revenue_service_role" on public.org_revenue
  for all using (auth.role() = 'service_role');

-- Function to update updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to automatically update updated_at
create trigger update_org_revenue_updated_at
  before update on public.org_revenue
  for each row
  execute function public.update_updated_at_column();

-- Add comments
comment on table public.org_revenue is 'Organization revenue metrics including MRR, ARR, and churn rate';
comment on column public.org_revenue.mrr is 'Monthly Recurring Revenue in cents';
comment on column public.org_revenue.arr is 'Annual Recurring Revenue in cents';
comment on column public.org_revenue.churn_rate is 'Churn rate as a percentage (0-100)'; 