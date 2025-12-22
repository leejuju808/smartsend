-- A) Leads hardening (idempotent)

alter table public.leads
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists domain citext,
  add column if not exists meta jsonb default '{}'::jsonb;

create index if not exists idx_leads_user_email on public.leads(user_id, email);
create index if not exists idx_leads_user_domain on public.leads(user_id, domain);

-- Unique per owner (email can repeat across tenants)
do $$ begin
  if not exists (select 1 from pg_constraint where conname='uq_leads_user_email') then
    alter table public.leads add constraint uq_leads_user_email unique (user_id, email);
  end if;
end $$;

-- B) Import state tables

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text,
  status text not null check (status in ('staged','validating','ready','applying','done','error')) default 'staged',
  total_rows int default 0,
  valid_rows int default 0,
  invalid_rows int default 0,
  deduped_rows int default 0,
  error text
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_no int not null,
  raw jsonb not null,                     -- unmapped key/values from CSV
  mapped jsonb default '{}'::jsonb,       -- normalized fields after mapping
  issues text[] default '{}',             -- ["bad_email","missing_email","dup_in_file","dup_in_db",...]
  is_valid boolean default false
);

create index if not exists idx_import_rows_job on public.import_rows(job_id);
create index if not exists idx_import_rows_valid on public.import_rows(job_id, is_valid);

-- C) Email + domain helpers

create or replace function public.clean_email(p text)
returns citext language sql immutable as $$
  select nullif(lower(trim(p)), '');
$$;

create or replace function public.extract_domain(p_email citext)
returns citext language sql immutable as $$
  select case
    when p_email is null then null
    else split_part(p_email::text, '@', 2)
  end::citext;
$$;

-- Simple RFC-ish email check
create or replace function public.is_valid_email(p text)
returns boolean language sql immutable as $$
  select coalesce(p ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$', false)
  from (values (upper(coalesce(p,'')))) v(p);
$$;

-- D) Validate + map staged rows according to a mapping
-- mapping example:
-- { "first_name":"First Name", "last_name":"Last", "email":"Email",
--   "company":"Company", "phone":"Phone", "custom": {"title":"Job Title"} }
create or replace function public.validate_import_job(
  p_job uuid,
  p_mapping jsonb,
  p_user uuid
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_email_col text := coalesce(p_mapping->>'email', 'email');
  v_custom jsonb := coalesce(p_mapping->'custom','{}'::jsonb);
  r record;
  v_seen_emails text[] := '{}';
  v_valid int := 0;
  v_invalid int := 0;
  v_dedup int := 0;
begin
  update public.import_jobs set status='validating' where id=p_job;

  for r in
    select id, raw
    from public.import_rows
    where job_id = p_job
    order by row_no
  loop
    -- Build mapped row
    -- pull helper to read a column by CSV header name
    -- example: raw = {"Email":"a@b.com","First Name":"Ana"}
    -- we map according to p_mapping keys
    -- NOTE: JSONB ->> returns text
    -- Standard fields
    declare
      v_first text := coalesce(r.raw->>(p_mapping->>'first_name'), null);
      v_last  text := coalesce(r.raw->>(p_mapping->>'last_name'), null);
      v_email text := coalesce(r.raw->>(v_email_col), null);
      v_company text := coalesce(r.raw->>(p_mapping->>'company'), null);
      v_phone text := coalesce(r.raw->>(p_mapping->>'phone'), null);
      v_meta jsonb := '{}'::jsonb;
      v_clean citext := public.clean_email(v_email);
      v_domain citext := public.extract_domain(v_clean);
      v_issues text[] := '{}';
      v_ok boolean := true;
      v_custom_key text;
      v_custom_col text;
    begin
      -- attach custom columns into meta
      for v_custom_key, v_custom_col in 
        select key::text, value::text from jsonb_each_text(v_custom)
      loop
        v_meta := v_meta || jsonb_build_object(v_custom_key, coalesce(r.raw->>v_custom_col, null));
      end loop;

      -- validations
      if v_clean is null then
        v_issues := array_append(v_issues, 'missing_email'); v_ok := false;
      elsif not public.is_valid_email(v_clean::text) then
        v_issues := array_append(v_issues, 'bad_email'); v_ok := false;
      end if;

      -- duplicate within file
      if v_ok and (v_seen_emails @> ARRAY[v_clean::text]) then
        v_issues := array_append(v_issues, 'dup_in_file'); v_ok := false; v_dedup := v_dedup + 1;
      end if;

      -- duplicate in DB for this user
      if v_ok and exists(select 1 from public.leads where user_id=p_user and email=v_clean) then
        v_issues := array_append(v_issues, 'dup_in_db'); v_ok := false; v_dedup := v_dedup + 1;
      end if;

      -- write row
      update public.import_rows
         set mapped = jsonb_build_object(
              'first_name', v_first,
              'last_name',  v_last,
              'email',      v_clean,
              'company',    v_company,
              'phone',      v_phone,
              'domain',     v_domain,
              'meta',       v_meta
            ),
             issues = v_issues,
             is_valid = v_ok
       where id = r.id;

      if v_ok then
        v_valid := v_valid + 1;
        v_seen_emails := array_append(v_seen_emails, v_clean::text);
      else
        v_invalid := v_invalid + 1;
      end if;
    end;
  end loop;

  update public.import_jobs
     set status = 'ready',
         valid_rows = v_valid,
         invalid_rows = v_invalid,
         deduped_rows = v_dedup
   where id = p_job;
end$$;

-- E) Apply (upsert) valid rows to leads
create or replace function public.apply_import_job(
  p_job uuid,
  p_user uuid,
  p_campaign uuid default null,   -- optional: also attach to a campaign list table
  p_merge boolean default true    -- merge existing lead by email if found
) returns int
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count int := 0;
  r record;
  v_lead uuid;
begin
  update public.import_jobs set status='applying' where id=p_job;

  for r in
    select mapped
    from public.import_rows
    where job_id=p_job and is_valid=true
  loop
    -- upsert by (user,email)
    insert into public.leads (user_id, first_name, last_name, email, company, phone, domain, meta)
    values (
      p_user,
      nullif(r.mapped->>'first_name',''),
      nullif(r.mapped->>'last_name',''),
      r.mapped->>'email',
      nullif(r.mapped->>'company',''),
      nullif(r.mapped->>'phone',''),
      nullif(r.mapped->>'domain','')::citext,
      coalesce(r.mapped->'meta','{}'::jsonb)
    )
    on conflict (user_id, email) do update
      set first_name = coalesce(excluded.first_name, public.leads.first_name),
          last_name  = coalesce(excluded.last_name, public.leads.last_name),
          company    = coalesce(excluded.company,    public.leads.company),
          phone      = coalesce(excluded.phone,      public.leads.phone),
          domain     = coalesce(excluded.domain,     public.leads.domain),
          meta       = public.leads.meta || excluded.meta
    returning id into v_lead;

    if p_campaign is not null then
      -- Check if campaign_leads table exists and has the right structure
      if exists (select 1 from information_schema.tables where table_schema='public' and table_name='campaign_leads') then
        insert into public.campaign_leads (campaign_id, lead_id)
        values (p_campaign, v_lead)
        on conflict do nothing;
      end if;
    end if;

    v_count := v_count + 1;
  end loop;

  update public.import_jobs set status='done' where id=p_job;
  return v_count;
end$$;

-- RLS (reads allowed to owner; writes via service role from API)
alter table public.import_jobs enable row level security;
alter table public.import_rows enable row level security;

drop policy if exists sel_jobs on public.import_jobs;
create policy sel_jobs on public.import_jobs for select to authenticated using (user_id = auth.uid());

drop policy if exists sel_rows on public.import_rows;
create policy sel_rows on public.import_rows for select to authenticated using (
  job_id in (select id from public.import_jobs j where j.user_id = auth.uid())
);

