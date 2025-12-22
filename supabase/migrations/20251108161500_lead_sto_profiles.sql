-- Lead send-time optimization profiles
-- Create table, helper function, policies, and view

create table if not exists public.lead_sto_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  tz text,
  hist_opens int[] not null default array_fill(0, ARRAY[24]),
  hist_clicks int[] not null default array_fill(0, ARRAY[24]),
  best_hour smallint,
  best_hour_conf real,
  last_observed_at timestamptz,
  unique (campaign_id, lead_id)
);

create index if not exists idx_sto_campaign_lead on public.lead_sto_profiles (campaign_id, lead_id);
create index if not exists idx_sto_best_hour on public.lead_sto_profiles (campaign_id, best_hour);

create or replace function public.tg_touch_sto_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists trg_touch_sto_profiles on public.lead_sto_profiles;

create trigger trg_touch_sto_profiles
before update on public.lead_sto_profiles
for each row
execute function public.tg_touch_sto_updated_at();

alter table public.lead_sto_profiles enable row level security;

drop policy if exists sel_sto_view on public.lead_sto_profiles;
create policy sel_sto_view
on public.lead_sto_profiles
for select
to authenticated
using (public.is_campaign_viewer(campaign_id));

drop policy if exists upsert_sto_edit on public.lead_sto_profiles;
create policy upsert_sto_edit
on public.lead_sto_profiles
for insert
to authenticated
with check (public.is_campaign_editor(campaign_id));

drop policy if exists upd_sto_edit on public.lead_sto_profiles;
create policy upd_sto_edit
on public.lead_sto_profiles
for update
to authenticated
using (public.is_campaign_editor(campaign_id))
with check (public.is_campaign_editor(campaign_id));

create or replace function public.arr24_inc(base int[], idx int, inc int default 1)
returns int[]
language plpgsql
immutable
as $$
declare
  outarr int[] := base;
begin
  if array_length(outarr, 1) is distinct from 24 then
    outarr := array_fill(0, ARRAY[24]);
  end if;
  if idx < 0 or idx > 23 then
    return outarr;
  end if;
  outarr[idx + 1] := coalesce(outarr[idx + 1], 0) + inc;
  return outarr;
end
$$;

create or replace view public.v_sto_samples as
select
  te.campaign_id,
  te.lead_id,
  date_trunc('hour', te.created_at) as event_hour_utc,
  te.event,
  te.url,
  te.created_at
from public.tracking_events te
where te.event in ('open', 'click');

