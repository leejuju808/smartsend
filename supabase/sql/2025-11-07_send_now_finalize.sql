-- send_now_finalize helper and supporting index

create index if not exists idx_send_queue_thread_status
  on public.send_queue(thread_id, status);

create or replace function public.send_now_finalize(
  p_thread_id uuid,
  p_campaign_id uuid,
  p_lead_id uuid,
  p_step_no int,
  p_provider text,
  p_provider_message_id text,
  p_provider_thread_id text,
  p_to_email citext,
  p_subject_snapshot text
)
returns void
language plpgsql
security definer
as $$
begin
  -- A) Write send_logs row
  insert into public.send_logs (
    id, created_at, campaign_id, lead_id, step_no, provider,
    provider_message_id, provider_thread_id, to_email, subject_snapshot
  )
  values (
    gen_random_uuid(), now(), p_campaign_id, p_lead_id, p_step_no, p_provider,
    p_provider_message_id, p_provider_thread_id, p_to_email, p_subject_snapshot
  );

  -- B) Cancel any queued follow-ups for this thread
  update public.send_queue
    set status = 'canceled', canceled_reason = 'manual_send', updated_at = now()
    where thread_id = p_thread_id and status in ('queued','pending','ready');

  -- C) Flip needs_reply off (composer thread handled)
  update public.inbox_threads
    set needs_reply = false, updated_at = now()
    where id = p_thread_id;
end;
$$;



