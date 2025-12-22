create table if not exists public.sending_domains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  domain text not null,
  from_name text,
  from_email text,                     -- e.g., noreply@yourdomain.com
  dkim_selector text not null default 'default', -- provider DKIM selector
  notes text,
  last_check_at timestamptz,
  last_check_status text,              -- 'pass' | 'warn' | 'fail'
  last_check_details jsonb,            -- raw results
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(workspace_id, domain)
);

create index if not exists sending_domains_workspace_idx
  on public.sending_domains(workspace_id);

alter table public.sending_domains enable row level security;

create policy "service role full on sending_domains"
on public.sending_domains
as permissive for all to service_role
using (true) with check (true);

create policy "users select own sending_domains"
on public.sending_domains
for select to authenticated
using (workspace_id = auth.uid());

create policy "users insert own sending_domains"
on public.sending_domains
for insert to authenticated
with check (workspace_id = auth.uid());

create policy "users update own sending_domains"
on public.sending_domains
for update to authenticated
using (workspace_id = auth.uid())
with check (workspace_id = auth.uid());

create policy "users delete own sending_domains"
on public.sending_domains
for delete to authenticated
using (workspace_id = auth.uid());

-- Bounce rate by recipient domain (last 7 and 30 days)
create or replace view public.v_bounce_rate_7d as
select
  j.workspace_id,
  lower(split_part(j.to_email, '@', 2)) as recipient_domain,
  count(*) filter (where j.status = 'sent') as sent,
  count(*) filter (where j.bounced_at is not null) as bounces,
  case
    when count(*) filter (where j.status = 'sent') = 0 then 0
    else round( (count(*) filter (where j.bounced_at is not null))::numeric
                / nullif(count(*) filter (where j.status = 'sent'),0) * 100, 2)
  end as bounce_pct
from public.email_jobs j
where j.created_at >= now() - interval '7 days'
group by 1,2;

create or replace view public.v_bounce_rate_30d as
select
  j.workspace_id,
  lower(split_part(j.to_email, '@', 2)) as recipient_domain,
  count(*) filter (where j.status = 'sent') as sent,
  count(*) filter (where j.bounced_at is not null) as bounces,
  case
    when count(*) filter (where j.status = 'sent') = 0 then 0
    else round( (count(*) filter (where j.bounced_at is not null))::numeric
                / nullif(count(*) filter (where j.status = 'sent'),0) * 100, 2)
  end as bounce_pct
from public.email_jobs j
where j.created_at >= now() - interval '30 days'
group by 1,2;

alter view public.v_bounce_rate_7d  set (security_invoker = on);
alter view public.v_bounce_rate_30d set (security_invoker = on);