-- Block 14500: Workspace Profile + Onboarding Flow v1
-- Updates workspace_profile schema and adds default tone_style
-- Enables day 1 setup for roofing owners

-- Update avg_job_value to numeric(12,2) for precision
-- Handle null values and existing numeric types safely
do $$
begin
  -- Only alter if column exists and type is different
  if exists (
    select 1 from information_schema.columns
    where table_name = 'workspace_profile'
    and column_name = 'avg_job_value'
    and data_type != 'numeric'
  ) then
    alter table workspace_profile
      alter column avg_job_value type numeric(12,2) using avg_job_value::numeric(12,2);
  elsif exists (
    select 1 from information_schema.columns
    where table_name = 'workspace_profile'
    and column_name = 'avg_job_value'
    and udt_name = 'numeric'
  ) then
    -- Column exists as numeric but might not be numeric(12,2)
    alter table workspace_profile
      alter column avg_job_value type numeric(12,2) using avg_job_value::numeric(12,2);
  end if;
end $$;

-- Set default tone_style to 'direct' if not already set
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'workspace_profile'
    and column_name = 'tone_style'
    and column_default is null
  ) then
    alter table workspace_profile
      alter column tone_style set default 'direct';
  end if;
end $$;

