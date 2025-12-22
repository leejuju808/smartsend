-- Import rows inline editing helpers (idempotent)

-- Ensure import_rows has columns required for raw patch + validation state
alter table public.import_rows
  add column if not exists raw jsonb,
  add column if not exists normalized jsonb,
  add column if not exists valid boolean,
  add column if not exists errors jsonb;

create index if not exists idx_impr_job_valid on public.import_rows(job_id, valid);

-- Lightweight email sanity helper
create or replace function public._is_email(p text) returns boolean
language sql immutable as $$
  select p ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
$$;

-- Normalize + validate import row payloads
create or replace function public._normalize_and_validate(p_raw jsonb)
returns table (normalized jsonb, valid boolean, errors jsonb)
language plpgsql as $$
declare
  v_email text;
  v_first text;
  v_last  text;
  v_company text;
  v_domain text;
  v_tz text;
  err text[];
begin
  v_email   := lower(coalesce(p_raw->>'email',''));
  v_first   := nullif(trim(coalesce(p_raw->>'first_name','')), '');
  v_last    := nullif(trim(coalesce(p_raw->>'last_name','')), '');
  v_company := nullif(trim(coalesce(p_raw->>'company','')), '');
  v_domain  := coalesce(p_raw->>'domain', substring(v_email from '@(.*)$'));
  v_tz      := nullif(trim(coalesce(p_raw->>'tz','')), '');

  err := array[]::text[];

  if v_email is null or v_email = '' or not public._is_email(v_email) then
    err := err || 'email_invalid';
  end if;

  if v_tz is not null and not (v_tz ~ '^[A-Za-z_\/]+$') then
    err := err || 'tz_invalid';
  end if;

  normalized := jsonb_build_object(
    'email', v_email,
    'first_name', v_first,
    'last_name',  v_last,
    'company',    v_company,
    'domain',     v_domain,
    'tz',         v_tz
  );

  valid := coalesce(array_length(err,1),0) = 0;
  errors := case when valid then '[]'::jsonb else to_jsonb(err) end;

  return next;
end;
$$;

-- Patch + validate a single import row (raw json merge)
create or replace function public.import_row_patch_and_validate(
  p_row_id uuid,
  p_patch jsonb
) returns table (row_id uuid, valid boolean, errors jsonb, normalized jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_raw jsonb;
  v_norm jsonb;
  v_valid boolean;
  v_err jsonb;
begin
  select j.user_id, r.raw
    into v_owner, v_raw
  from public.import_rows r
  join public.import_jobs j on j.id = r.job_id
  where r.id = p_row_id;

  if v_owner is null then
    raise exception 'Row not found';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  v_raw := coalesce(v_raw,'{}'::jsonb) || coalesce(p_patch,'{}'::jsonb);

  select n.normalized, n.valid, n.errors
    into v_norm, v_valid, v_err
  from public._normalize_and_validate(v_raw) as n;

  update public.import_rows
     set raw = v_raw,
         normalized = v_norm,
         valid = v_valid,
         errors = v_err
   where id = p_row_id;

  return query
    select p_row_id, v_valid, v_err, v_norm;
end;
$$;

revoke all on function public.import_row_patch_and_validate(uuid,jsonb) from public;
grant execute on function public.import_row_patch_and_validate(uuid,jsonb) to authenticated;

-- Bulk revalidate helper per job
create or replace function public.import_job_revalidate(p_job_id uuid)
returns table (row_id uuid, valid boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n jsonb;
  v boolean;
  e jsonb;
begin
  if not exists (select 1 from public.import_jobs j where j.id = p_job_id and j.user_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;

  for r in select id, raw from public.import_rows where job_id = p_job_id loop
    select nn.normalized, nn.valid, nn.errors into n, v, e
    from public._normalize_and_validate(r.raw) nn;

    update public.import_rows
       set normalized = n, valid = v, errors = e
     where id = r.id;

    row_id := r.id;
    valid := v;
    return next;
  end loop;
end;
$$;

revoke all on function public.import_job_revalidate(uuid) from public;
grant execute on function public.import_job_revalidate(uuid) to authenticated;

