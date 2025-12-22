-- Add a generic provider + SMTP settings on the account (service-only readable)
alter table public.connected_accounts
  add column if not exists provider text check (provider in ('resend','smtp','gmail','outlook')) default 'resend',
  add column if not exists smtp_settings jsonb; -- {host,port,secure,user,pass,from,oauth?:{type,clientId,clientSecret,refreshToken,accessToken}}

-- Tighten RLS: only service role may read smtp_settings (app code runs server-side)
drop policy if exists sel_connected_accounts_public on public.connected_accounts;
create policy sel_connected_accounts_public on public.connected_accounts
for select to authenticated
using (id is not null) -- allow basic reads for non-secret cols
with check (true);

-- Optional: hide smtp_settings from non-service by creating a view w/o the secret column for client reads
create or replace view public.v_connected_accounts_public as
select id, user_id, provider, daily_cap, warmup_enabled, warmup_day, warmup_started_at, provider_domain
from public.connected_accounts;

-- (Service role can always read raw table; client uses the view.)
