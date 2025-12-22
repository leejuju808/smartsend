-- Cancel Followups on Reply
-- This trigger automatically cancels future queue items when a lead replies

-- Function to cancel future queue items when email_logs.status becomes 'replied'
create or replace function public.cancel_followups_on_reply()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Fire only when status becomes 'replied' (INSERT with replied or UPDATE to replied)
  if (tg_op = 'INSERT' and new.status = 'replied')
     or (tg_op = 'UPDATE' and new.status = 'replied' and coalesce(old.status,'') <> 'replied') then

    -- Cancel ALL future queue items for this lead in this campaign
    update public.send_queue sq
      set status = 'canceled',
          reason_canceled = 'lead_replied',
          canceled_at = now()
    where sq.workspace_id = new.workspace_id
      and sq.lead_id = new.lead_id
      and sq.campaign_id = coalesce(new.campaign_id, sq.campaign_id) -- match by campaign if available
      and sq.status in ('pending','scheduled','sending')
      and sq.scheduled_at > coalesce(new.replied_at, new.sent_at, new.created_at, now()); -- only future steps
  end if;

  return new;
end;
$$;

-- Drop existing trigger if it exists
drop trigger if exists trg_cancel_followups_on_reply on public.email_logs;

-- Create trigger
create trigger trg_cancel_followups_on_reply
after insert or update on public.email_logs
for each row execute function public.cancel_followups_on_reply(); 