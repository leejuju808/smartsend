-- Lead import staging + bulk insert helpers (idempotent)

-- Staging table for user CSV uploads
create table if not exists public.lead_import_staging (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  filename text,
  headers text[],
  rows jsonb not null default '[]'::jsonb,
  mapped jsonb not null default '{}'::jsonb,
  preview jsonb not null default '[]'::jsonb
);

create index if not exists idx_import_user
  on public.lead_import_staging(user_id, created_at desc);

-- Unique guard for leads by campaign + email scope
create unique index if not exists uniq_leads_campaign_email
  on public.leads(campaign_id, email);

-- Bulk insert helper (dedupe within campaign scope)
drop function if exists public.insert_leads_bulk(uuid, jsonb);

create or replace function public.insert_leads_bulk(p_campaign uuid, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  inserted int := 0;
begin
  if p_campaign is null then
    raise exception 'campaign required';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    begin
      insert into public.leads(
        campaign_id,
        email,
        first_name,
        last_name,
        company,
        country,
        tz,
        meta
      )
      values (
        p_campaign,
        lower(coalesce(r->>'email', '')),
        nullif(trim(coalesce(r->>'first_name', '')),''),
        nullif(trim(coalesce(r->>'last_name', '')),''),
        nullif(trim(coalesce(r->>'company', '')),''),
        nullif(trim(coalesce(r->>'country', '')),''),
        nullif(trim(coalesce(r->>'tz', '')),''),
        coalesce(r->'meta', '{}'::jsonb)
      )
      on conflict (campaign_id, email) do nothing;

      if found then
        inserted := inserted + 1;
      end if;

    exception when others then
      -- Skip bad rows but continue processing
      continue;
    end;
  end loop;

  return inserted;
end;
$$;

revoke all on function public.insert_leads_bulk(uuid, jsonb) from public;
grant execute on function public.insert_leads_bulk(uuid, jsonb) to service_role;


