-- 05_first_open.sql
create or replace function mark_first_open(p_job_id uuid)
returns void language plpgsql security definer as $$
begin
  update email_sends set
    first_open_at = coalesce(first_open_at, now()),
    opens = opens + 1
  where job_id = p_job_id;
end $$;