-- BLOCK 271100 — SmartSend Hard Evidence Sprint
-- Turn results into physical proof (photo + origin stamp + street-level location + monthly counters)
--
-- Goals:
-- - When a job is marked completed: snapshot closed_at + closed_month + closed_city + closed_zip_code
-- - Mark/assume SmartSend origin on jobs (originated_via_smartsend)
-- - Schema-drift safe (jobs table exists in multiple variants across migrations)

-- ------------------------------------------------------------
-- 1) Add columns to public.jobs (schema-drift safe)
-- ------------------------------------------------------------

alter table public.jobs
  add column if not exists originated_via_smartsend boolean not null default true,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_month date,
  add column if not exists closed_city text,
  add column if not exists closed_zip_code text;

comment on column public.jobs.originated_via_smartsend is
  'Block 271100: True when the job originated via SmartSend (default true for SmartSend-created jobs).';
comment on column public.jobs.closed_at is
  'Block 271100: Timestamp when job was marked completed/closed.';
comment on column public.jobs.closed_month is
  'Block 271100: Month bucket for closed_at (UTC, first day of month).';
comment on column public.jobs.closed_city is
  'Block 271100: City snapshot captured at close time (no address exposure needed).';
comment on column public.jobs.closed_zip_code is
  'Block 271100: ZIP snapshot captured at close time (no address exposure needed).';

create index if not exists idx_jobs_closed_at on public.jobs(closed_at desc) where closed_at is not null;
create index if not exists idx_jobs_closed_month on public.jobs(closed_month desc) where closed_month is not null;
create index if not exists idx_jobs_originated_via_smartsend on public.jobs(originated_via_smartsend);

-- ------------------------------------------------------------
-- 2) Helper: best-effort city/zip extraction from address
-- ------------------------------------------------------------

create or replace function public.ss_extract_city_zip_from_address(p_address text)
returns table(city text, zip_code text)
language plpgsql
stable
as $$
declare
  parts text[];
  n int;
  state_zip text;
  zip text;
begin
  city := null;
  zip_code := null;

  if p_address is null or btrim(p_address) = '' then
    return;
  end if;

  -- ZIP: first 5-digit sequence (optionally +4)
  begin
    select (regexp_match(p_address, '(\\m\\d{5}(?:-\\d{4})?\\M)'))[1]
      into zip;
  exception when others then
    zip := null;
  end;

  zip_code := nullif(btrim(coalesce(zip, '')), '');

  -- City: assume "..., City, ST ZIP" (take second-to-last comma segment)
  begin
    parts := string_to_array(p_address, ',');
    n := array_length(parts, 1);
    if n is not null and n >= 2 then
      city := nullif(btrim(parts[n-1]), '');
      state_zip := nullif(btrim(parts[n]), '');

      -- If we failed to extract ZIP above, try to extract from the last segment
      if zip_code is null and state_zip is not null then
        select (regexp_match(state_zip, '(\\m\\d{5}(?:-\\d{4})?\\M)'))[1]
          into zip;
        zip_code := nullif(btrim(coalesce(zip, '')), '');
      end if;
    end if;
  exception when others then
    city := null;
  end;

  return;
end;
$$;

comment on function public.ss_extract_city_zip_from_address(text) is
  'Block 271100: Best-effort city/zip extraction from a single address string.';

-- ------------------------------------------------------------
-- 3) Trigger: set closed_at/closed_month + snapshot city/zip when job completes
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'jobs'
  ) then
    -- Create trigger function
    create or replace function public.ss_jobs_on_completed_set_proof_fields()
    returns trigger
    language plpgsql
    as $$
    declare
      v_addr text;
      v_city text;
      v_zip text;
    begin
      -- Only act on transition into completed.
      if tg_op = 'UPDATE' then
        if new.status is distinct from old.status and new.status = 'completed' then
          -- closed_at + closed_month
          if new.closed_at is null then
            new.closed_at := now();
          end if;
          if new.closed_month is null and new.closed_at is not null then
            new.closed_month := date_trunc('month', new.closed_at at time zone 'utc')::date;
          end if;

          -- Snapshot city/zip (best-effort)
          v_addr := nullif(btrim(coalesce(new.address, '')), '');
          if (new.closed_city is null or new.closed_zip_code is null) and v_addr is not null then
            select city, zip_code into v_city, v_zip
            from public.ss_extract_city_zip_from_address(v_addr)
            limit 1;

            if new.closed_city is null then
              new.closed_city := v_city;
            end if;
            if new.closed_zip_code is null then
              new.closed_zip_code := v_zip;
            end if;
          end if;

          -- Default: jobs created by SmartSend are considered originated via SmartSend.
          if new.originated_via_smartsend is null then
            new.originated_via_smartsend := true;
          end if;
        end if;
      end if;

      return new;
    end;
    $$;

    -- Attach trigger
    drop trigger if exists trg_ss_jobs_on_completed_set_proof_fields on public.jobs;
    create trigger trg_ss_jobs_on_completed_set_proof_fields
      before update of status on public.jobs
      for each row
      execute function public.ss_jobs_on_completed_set_proof_fields();
  end if;
end $$;

-- ------------------------------------------------------------
-- 4) Backfill (best-effort): set closed_at/closed_month for existing completed jobs
-- ------------------------------------------------------------

do $$
declare
  v_has_created_at boolean;
  v_has_updated_at boolean;
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'jobs'
  ) then
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='jobs' and column_name='created_at'
  ) into v_has_created_at;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='jobs' and column_name='updated_at'
  ) into v_has_updated_at;

  -- Prefer updated_at if present, otherwise created_at.
  if v_has_updated_at then
    execute $$
      update public.jobs
      set
        closed_at = coalesce(closed_at, updated_at),
        closed_month = coalesce(closed_month, date_trunc('month', coalesce(closed_at, updated_at) at time zone 'utc')::date)
      where status = 'completed'
        and closed_at is null
    $$;
  elsif v_has_created_at then
    execute $$
      update public.jobs
      set
        closed_at = coalesce(closed_at, created_at),
        closed_month = coalesce(closed_month, date_trunc('month', coalesce(closed_at, created_at) at time zone 'utc')::date)
      where status = 'completed'
        and closed_at is null
    $$;
  end if;

  -- Best-effort snapshot city/zip for completed jobs missing it.
  execute $$
    update public.jobs j
    set
      closed_city = coalesce(j.closed_city, x.city),
      closed_zip_code = coalesce(j.closed_zip_code, x.zip_code)
    from lateral public.ss_extract_city_zip_from_address(j.address) x
    where j.status = 'completed'
      and (j.closed_city is null or j.closed_zip_code is null)
      and j.address is not null
      and btrim(j.address) <> ''
  $$;
end $$;



