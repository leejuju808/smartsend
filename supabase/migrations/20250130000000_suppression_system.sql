-- Global Suppression Registry System
-- Safe to run once (idempotent)

-- =====================================================
-- A) Global suppression registry
-- =====================================================
create table if not exists public.suppressed_recipients (
  email citext primary key,
  reason text check (reason in ('unsubscribe','bounce','manual','complaint','other')) not null,
  source text default 'system',                            -- system | user | import | provider
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_suppressed_reason on public.suppressed_recipients(reason);

-- =====================================================
-- Upsert helper function
-- =====================================================
create or replace function public.suppress_email(p_email text, p_reason text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.suppressed_recipients(email, reason, source, meta)
  values (lower(p_email), p_reason, 'system', coalesce(p_meta, '{}'::jsonb))
  on conflict (email) do update
    set reason = excluded.reason,
        last_seen = now(),
        meta = public.suppressed_recipients.meta || excluded.meta;
end
$$;

grant execute on function public.suppress_email(text,text,jsonb) to anon, authenticated, service_role;

-- =====================================================
-- B) Campaign-level switch (default ON)
-- =====================================================
alter table public.campaigns
  add column if not exists respect_suppression boolean default true;

-- =====================================================
-- C) Backfill suppressions from existing messages (unsubscribe/bounce)
-- Assumes leads(email) and inbox_messages.lead_id available
-- =====================================================
with hits as (
  select distinct lower(l.email) as email,
         case when m.reply_label = 'unsubscribe' then 'unsubscribe' 
              when m.reply_label = 'bounce' then 'bounce'
              else 'other' end as reason
  from public.inbox_messages m
  join public.leads l on l.id = m.lead_id
  where m.reply_label in ('unsubscribe','bounce')
    and coalesce(l.email,'') <> ''
)
insert into public.suppressed_recipients(email, reason, source)
select email, reason, 'backfill'
from hits
on conflict (email) do update
  set reason   = excluded.reason,
      last_seen= now();

-- =====================================================
-- D) Fast check view (optional)
-- =====================================================
create or replace view public.v_suppression as
select email, reason, last_seen from public.suppressed_recipients;

-- =====================================================
-- RLS Policies
-- =====================================================
alter table public.suppressed_recipients enable row level security;

drop policy if exists sel_suppression_all on public.suppressed_recipients;
create policy sel_suppression_all on public.suppressed_recipients
  for select to authenticated
  using (true);  -- or filter to tenant if multi-tenant by domain/org

drop policy if exists insupd_suppression_srv on public.suppressed_recipients;
create policy insupd_suppression_srv on public.suppressed_recipients
  for insert to service_role using (true) with check (true);

drop policy if exists upd_suppression_srv on public.suppressed_recipients;
create policy upd_suppression_srv on public.suppressed_recipients
  for update to service_role using (true) with check (true);





