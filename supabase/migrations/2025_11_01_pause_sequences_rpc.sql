-- Optional RPC: pause sequences for a lead
create or replace function pause_sequences_for_lead(p_lead_id uuid)
returns void language plpgsql security definer as $$
begin
  -- Example: mark any pending send_queue items for this lead as paused/canceled
  update send_queue
    set status = 'paused'
  where lead_id = p_lead_id and status in ('queued','scheduled');
end$$;

