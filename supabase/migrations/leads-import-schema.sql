-- LEADS
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  email text not null,
  name text,
  company text,
  title text,
  phone text,
  tags text[] default '{}',
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);

-- simple trigger for updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
before update on public.leads
for each row execute procedure public.set_updated_at();

-- SEND QUEUE
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'pending', -- pending | sent | failed
  scheduled_at timestamptz,
  sent_at timestamptz,
  payload jsonb default '{}'::jsonb, -- subject, body, template_id, etc.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_send_queue_updated_at on public.send_queue;
create trigger trg_send_queue_updated_at
before update on public.send_queue
for each row execute procedure public.set_updated_at();

-- (Optional) Basic RLS - adjust to your auth model
alter table public.leads enable row level security;
alter table public.send_queue enable row level security;

-- Example policies (replace auth.uid() workspace join with your model)
-- If you have a table memberships(user_id, workspace_id), use that.
-- For now, allow service role for writes via API route.
create policy "leads read" on public.leads for select using (true);
create policy "send_queue read" on public.send_queue for select using (true);
