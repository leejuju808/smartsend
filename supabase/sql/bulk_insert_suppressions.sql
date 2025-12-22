-- /supabase/sql/bulk_insert_suppressions.sql
-- Optional RPC to speed up large suppression imports (1–5k rows) with dedupe
create or replace function public.bulk_insert_suppressions(
  in_profile_id uuid,
  in_emails text[],
  in_reasons text[] default null,
  in_sources text[] default null
)
returns table (inserted_count int)
language plpgsql
security invoker
as $$
declare
  i int;
  v_inserted int := 0;
  v_email text;
  v_reason text;
  v_source text;
begin
  if in_emails is null or array_length(in_emails,1) is null then
    return query select 0::int;
    return;
  end if;

  for i in 1..array_length(in_emails,1) loop
    v_email := public.normalize_email(in_emails[i]);
    v_reason := case when in_reasons is null then null else in_reasons[i] end;
    v_source := case when in_sources is null then null else in_sources[i] end;

    begin
      insert into public.suppressions_v2 (profile_id, email, reason, source)
      values (in_profile_id, v_email, v_reason, coalesce(v_source, 'import'))
      on conflict (profile_id, (public.normalize_email(email))) do nothing;
      if found then
        v_inserted := v_inserted + 1;
      end if;
    exception when unique_violation then
      null;
    end;
  end loop;

  return query select v_inserted;
end;
$$;

grant execute on function public.bulk_insert_suppressions(uuid, text[], text[], text[]) to authenticated;
comment on function public.bulk_insert_suppressions(uuid, text[], text[], text[]) is 'Bulk insert suppressions with dedupe and normalization.'; 