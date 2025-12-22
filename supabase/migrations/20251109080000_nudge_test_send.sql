-- Helper to enqueue a draft send for nudge test emails
create or replace function public.nudge_test_send(
  p_campaign_id uuid,
  p_to_email text,
  p_subject text,
  p_body text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q_id uuid;
begin
  if p_to_email is null or position('@' in p_to_email) = 0 then
    raise exception 'invalid_email';
  end if;

  insert into public.send_queue (id, thread_id, status, meta)
  values (
    gen_random_uuid(),
    null,
    'draft',
    jsonb_build_object(
      'source', 'nudge_test',
      'campaign_id', p_campaign_id,
      'to', p_to_email,
      'subject', coalesce(p_subject, ''),
      'body', coalesce(p_body, '')
    )
  )
  returning id into q_id;

  return jsonb_build_object('ok', true, 'queue_id', q_id);
end;
$$;


