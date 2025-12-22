-- Optional: Auto-pause campaign sends when Out of Office is detected
-- Note: This assumes campaign_schedules table exists. If not, modify to use campaigns table instead.

-- Create function to pause campaign on OOO
create or replace function pause_campaign_on_ooo()
returns trigger as $$
begin
  if new.reply_type = 'Out of Office' then
    -- Try to update campaign_schedules if it exists
    -- If campaign_schedules doesn't exist, comment out the next block and use campaigns instead
    update campaign_schedules
      set paused = true
      where campaign_id = new.campaign_id;
    
    -- Alternative: If using campaigns table with status column:
    -- update campaigns
    --   set status = 'paused'
    --   where id = new.campaign_id;
  end if;
  return new;
end;
$$ language plpgsql;

-- Create trigger
drop trigger if exists trg_pause_campaign_ooo on public.campaign_logs;
create trigger trg_pause_campaign_ooo
after update on campaign_logs
for each row
when (new.reply_type = 'Out of Office')
execute function pause_campaign_on_ooo();

