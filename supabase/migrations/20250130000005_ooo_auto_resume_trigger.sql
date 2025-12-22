-- Step 7 — Safeguards & Overrides
-- Auto-resume when non-OOO human reply comes in before pause_until

-- Function to auto-resume on non-OOO reply
create or replace function public.auto_resume_on_non_ooo_reply()
returns trigger
language plpgsql
as $$
declare
  v_campaign_id uuid;
  v_contact_id uuid;
  v_reply_kind text;
begin
  -- Only process if this is a reply_training_labels insert/update
  if tg_table_name = 'reply_training_labels' then
    v_campaign_id := new.campaign_id;
    v_contact_id := new.contact_id;
    v_reply_kind := new.reply_kind;
    
    -- If reply is NOT OOO and NOT bounce/unsub, and contact is paused due to OOO
    if v_reply_kind is not null 
       and v_reply_kind not in ('ooo', 'bounce', 'unsubscribe')
       and v_campaign_id is not null 
       and v_contact_id is not null then
      
      -- Check if paused due to OOO
      update public.campaign_contacts
      set 
        is_paused = false,
        pause_reason = null,
        pause_until = null,
        ooo_return_date = null
      where campaign_id = v_campaign_id
        and contact_id = v_contact_id
        and is_paused = true
        and pause_reason = 'ooo';
    end if;
  end if;
  
  return new;
end;
$$;

-- Create trigger on reply_training_labels
drop trigger if exists trg_auto_resume_non_ooo on public.reply_training_labels;
create trigger trg_auto_resume_non_ooo
after insert or update on public.reply_training_labels
for each row
execute function public.auto_resume_on_non_ooo_reply();















