-- A) Ensure leads table has a campaign+email unique constraint (normalized)

alter table public.leads
  add column if not exists email_norm text;

create or replace function public.norm_email(p text) returns text
language sql immutable as $$
  select case
    when p is null then null
    else lower(trim(p))
  end
$$;

update public.leads set email_norm = public.norm_email(email) where email is not null;

create unique index if not exists uq_leads_campaign_email
  on public.leads(campaign_id, email_norm)
  where email_norm is not null;

-- B) Staging table for preview/debug (optional but useful)
create table if not exists public.lead_import_staging (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  payload jsonb not null,              -- raw parsed row (mapped keys)
  valid boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);

alter table public.lead_import_staging enable row level security;

drop policy if exists "staging_read_own" on public.lead_import_staging;
create policy "staging_read_own"
on public.lead_import_staging for select
using (auth.uid() = user_id);

drop policy if exists "staging_write_own" on public.lead_import_staging;
create policy "staging_write_own"
on public.lead_import_staging for insert with check (auth.uid() = user_id);

-- C) RPC: bulk upsert with de-duplication (by campaign_id + email_norm)
create or replace function public.import_leads_json(
  p_campaign uuid,
  p_rows jsonb                    -- array of objects: [{ email, first_name, last_name, company, phone, custom1, ... }, ...]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_email text;
  v_email_norm text;
  v_first text;
  v_last text;
  v_company text;
  v_phone text;
  v_custom1 text;
  v_custom2 text;
  v_custom3 text;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_exists boolean;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be an array';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_email := nullif(trim((v_row->>'email')), '');
    v_email_norm := public.norm_email(v_email);

    v_first := nullif((v_row->>'first_name'), '');
    v_last  := nullif((v_row->>'last_name'), '');
    v_company := nullif((v_row->>'company'), '');
    v_phone := nullif((v_row->>'phone'), '');
    v_custom1 := nullif((v_row->>'custom1'), '');
    v_custom2 := nullif((v_row->>'custom2'), '');
    v_custom3 := nullif((v_row->>'custom3'), '');

    if v_email_norm is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Check if row exists before upsert
    select exists(
      select 1 from public.leads 
      where campaign_id = p_campaign 
        and email_norm = v_email_norm
    ) into v_exists;

    -- upsert pattern: use insert with on conflict
    insert into public.leads (campaign_id, email, email_norm, first_name, last_name, company, phone, custom1, custom2, custom3)
    values (p_campaign, v_email, v_email_norm, v_first, v_last, v_company, v_phone, v_custom1, v_custom2, v_custom3)
    on conflict (campaign_id, email_norm) do update
      set first_name = coalesce(excluded.first_name, leads.first_name),
          last_name  = coalesce(excluded.last_name, leads.last_name),
          company    = coalesce(excluded.company, leads.company),
          phone      = coalesce(excluded.phone, leads.phone),
          custom1    = coalesce(excluded.custom1, leads.custom1),
          custom2    = coalesce(excluded.custom2, leads.custom2),
          custom3    = coalesce(excluded.custom3, leads.custom3),
          email      = coalesce(excluded.email, leads.email),
          email_norm = excluded.email_norm;
    
    if v_exists then
      v_updated := v_updated + 1;
    else
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped
  );
end
$$;

