-- Send queue (one row per planned email)
-- Idempotent migration

create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  scheduled_at timestamptz not null,  -- when eligible to send
  status text not null check (status in ('queued','sending','sent','failed','canceled')) default 'queued',
  error text
);

create index if not exists idx_sq_user_sched on public.send_queue(user_id, scheduled_at);
create index if not exists idx_sq_user_status on public.send_queue(user_id, status);
create index if not exists idx_sq_campaign_status on public.send_queue(campaign_id, status);
create index if not exists idx_sq_lead_campaign on public.send_queue(lead_id, campaign_id);

-- Prevent double-queueing same lead in same campaign (once per step for MVP)
do $$ begin
  if not exists (select 1 from pg_constraint where conname='uq_sq_campaign_lead') then
    alter table public.send_queue add constraint uq_sq_campaign_lead unique (campaign_id, lead_id);
  end if;
end $$;

-- Minimal send logs (one row per attempt)
create table if not exists public.send_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  queue_id uuid references public.send_queue(id) on delete set null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  account_id uuid references public.connected_accounts(id) on delete set null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null check (status in ('sent','failed')) ,
  provider_id text,          -- message id from gmail/outlook
  error text,
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_logs_campaign on public.send_logs(campaign_id);
create index if not exists idx_logs_lead on public.send_logs(lead_id);

-- RLS
alter table public.send_queue enable row level security;
alter table public.send_logs enable row level security;

drop policy if exists sel_sq on public.send_queue;
create policy sel_sq on public.send_queue for select to authenticated using (user_id = auth.uid());
drop policy if exists ins_sq on public.send_queue;
create policy ins_sq on public.send_queue for insert to authenticated with check (user_id = auth.uid());
drop policy if exists upd_sq on public.send_queue;
create policy upd_sq on public.send_queue for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists del_sq on public.send_queue;
create policy del_sq on public.send_queue for delete to authenticated using (user_id = auth.uid());

-- Service role policies for cron jobs
drop policy if exists sel_sq_srv on public.send_queue;
create policy sel_sq_srv on public.send_queue for select to service_role using (true);
drop policy if exists upd_sq_srv on public.send_queue;
create policy upd_sq_srv on public.send_queue for update to service_role using (true) with check (true);

drop policy if exists sel_logs on public.send_logs;
create policy sel_logs on public.send_logs for select to authenticated using (
  lead_id in (select id from public.leads where user_id = auth.uid())
);

drop policy if exists ins_logs on public.send_logs;
create policy ins_logs on public.send_logs for insert to authenticated with check (
  lead_id in (select id from public.leads where user_id = auth.uid())
);

drop policy if exists ins_logs_srv on public.send_logs;
create policy ins_logs_srv on public.send_logs for insert to service_role with check (true);

drop policy if exists sel_logs_srv on public.send_logs;
create policy sel_logs_srv on public.send_logs for select to service_role using (true);

