-- ============================================================
-- BLOCK 287000 — SmartSend Offer Amplifier v1
-- “Make the Yes the Obvious Choice.”
--
-- Purpose:
-- - Log Offer Amplifier impressions and user actions for tuning.
-- ============================================================

create table if not exists public.offer_impressions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.roofing_companies(id) on delete cascade,
  trigger_reason text not null,
  plan_highlighted text not null check (plan_highlighted in ('starter','growth','domination')),
  shown_at timestamptz not null default now(),
  action_taken text not null default 'none' check (action_taken in ('upgrade','dismissed','paused','none'))
);

create index if not exists idx_offer_impressions_company_shown_at
  on public.offer_impressions(company_id, shown_at desc);

create index if not exists idx_offer_impressions_company_action
  on public.offer_impressions(company_id, action_taken);

comment on table public.offer_impressions is
  'Block 287000: Logs Offer Amplifier impressions and actions per company for tuning.';

alter table public.offer_impressions enable row level security;

-- Company members can read their own impressions
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'offer_impressions'
      and policyname = 'offer_impressions_select_company_members'
  ) then
    create policy offer_impressions_select_company_members
      on public.offer_impressions
      for select
      to authenticated
      using (public.is_company_member(company_id));
  end if;
end $$;

-- Company members can insert (panel shown)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'offer_impressions'
      and policyname = 'offer_impressions_insert_company_members'
  ) then
    create policy offer_impressions_insert_company_members
      on public.offer_impressions
      for insert
      to authenticated
      with check (public.is_company_member(company_id));
  end if;
end $$;

-- Company members can update (action taken)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'offer_impressions'
      and policyname = 'offer_impressions_update_company_members'
  ) then
    create policy offer_impressions_update_company_members
      on public.offer_impressions
      for update
      to authenticated
      using (public.is_company_member(company_id))
      with check (public.is_company_member(company_id));
  end if;
end $$;

-- Service role can manage all rows (future tuning / analytics jobs)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'offer_impressions'
      and policyname = 'offer_impressions_service_role_all'
  ) then
    create policy offer_impressions_service_role_all
      on public.offer_impressions
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

grant select, insert, update on public.offer_impressions to authenticated;
grant all on public.offer_impressions to service_role;









