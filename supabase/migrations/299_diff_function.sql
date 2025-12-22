-- Block 299: Diff function for comparing sequence versions
-- Returns JSON with before/after snapshots for comparison

create or replace function diff_sequence_versions(
  v1 uuid,
  v2 uuid
)
returns json
language plpgsql
as $$
declare
  s1 jsonb;
  s2 jsonb;
begin
  select snapshot into s1 from public.sequence_versions where id = v1;
  select snapshot into s2 from public.sequence_versions where id = v2;

  if s1 is null or s2 is null then
    return json_build_object('error', 'One or both versions not found');
  end if;

  -- Return before/after for MVP
  -- Can be enhanced later with true diff algorithm
  return json_build_object(
    'before', s1,
    'after', s2,
    'version1_id', v1,
    'version2_id', v2
  );
end;
$$;








