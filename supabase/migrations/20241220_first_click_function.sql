-- 06_first_click.sql
create or replace function mark_first_click(p_job_id uuid)
returns void language plpgsql security definer as $$
begin
  update email_sends set
    first_click_at = coalesce(first_click_at, now()),
    clicks = clicks + 1
  where job_id = p_job_id;
end $$;