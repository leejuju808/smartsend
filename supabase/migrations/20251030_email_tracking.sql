-- 0) DB schema (Supabase SQL)

-- A) Per-lead tracking + unsubscribe token

alter table public.leads
  add column if not exists tracking_token uuid default gen_random_uuid(),
  add column if not exists unsubscribed boolean not null default false;


create index if not exists leads_tracking_token_idx on public.leads (tracking_token);
create index if not exists leads_unsubscribed_idx on public.leads (unsubscribed);


-- B) Email events log

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  lead_id uuid not null,
  type text not null check (type in ('open','click','unsub')),
  url text,
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);


create index if not exists email_events_campaign_type_idx on public.email_events (campaign_id, type, created_at desc);
create index if not exists email_events_lead_idx on public.email_events (lead_id, created_at desc);


-- C) RLS (tighten with your tenant/workspace predicate in your app)
alter table public.email_events enable row level security;


do $$
begin
  if not exists (select 1 from pg_policies where tablename='email_events' and policyname='email_events_read') then
    create policy "email_events_read" on public.email_events for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='email_events' and policyname='email_events_write') then
    create policy "email_events_write" on public.email_events for insert to authenticated with check (true);
  end if;
end$$;


