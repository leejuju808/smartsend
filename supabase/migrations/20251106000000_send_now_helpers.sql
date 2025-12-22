-- Send-now enqueue helper and view
drop function if exists public.enqueue_send_job(uuid, uuid, uuid, int, timestamptz, jsonb, text);

create or replace function public.enqueue_send_job(
  p_campaign uuid,
  p_lead uuid,
  p_from_account uuid,
  p_step_no int,
  p_run_at timestamptz,
  p_payload jsonb,
  p_provider text default 'gmail'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_email citext;
  v_owner uuid;
begin
  select l.email, c.owner_id
    into v_email, v_owner
  from public.leads l
  join public.campaigns c on c.id = p_campaign
  where l.id = p_lead;

  if v_email is null or v_owner is null then
    raise exception 'Lead or campaign owner not found';
  end if;

  if public.is_suppressed(p_campaign, v_owner, v_email::text) then
    insert into public.send_logs (
      campaign_id,
      lead_id,
      account_id,
      to_email,
      status,
      reason
    )
    values (
      p_campaign,
      p_lead,
      p_from_account,
      lower(v_email::text),
      'blocked',
      'suppressed'
    );
    return null;
  end if;

  insert into public.send_queue (
    id,
    campaign_id,
    lead_id,
    from_account_id,
    step_no,
    run_at,
    status,
    payload,
    provider
  )
  values (
    v_id,
    p_campaign,
    p_lead,
    p_from_account,
    coalesce(p_step_no, 1),
    p_run_at,
    'queued',
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_provider, 'gmail')
  );

  return v_id;
end;
$$;

revoke all on function public.enqueue_send_job(uuid, uuid, uuid, int, timestamptz, jsonb, text) from public;
grant execute on function public.enqueue_send_job(uuid, uuid, uuid, int, timestamptz, jsonb, text) to service_role;

create or replace view public.v_queue_mine as
select
  q.*,
  c.user_id as owner_id
from public.send_queue q
join public.campaigns c on c.id = q.campaign_id;

alter view public.v_queue_mine owner to postgres;





