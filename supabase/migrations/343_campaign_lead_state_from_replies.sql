-- Block 343 — Auto Stop Followups from AI Signals
-- Trigger: when a reply with ai_stop_followups = true arrives, update campaign_lead_state

create or replace function apply_reply_to_campaign_lead_state()
returns trigger as $$
declare
  existing_state campaign_lead_state;
begin
  -- We only care about rows that belong to a workspace, campaign, and lead
  if NEW.workspace_id is null or NEW.campaign_id is null or NEW.lead_id is null then
    return NEW;
  end if;

  select * into existing_state
  from campaign_lead_state
  where workspace_id = NEW.workspace_id
    and campaign_id = NEW.campaign_id
    and lead_id = NEW.lead_id
  for update of campaign_lead_state;

  if not found then
    insert into campaign_lead_state (
      workspace_id,
      campaign_id,
      lead_id,
      replied,
      last_reply_id,
      last_replied_at,
      stop_followups,
      stopped_at,
      stopped_by_reply_id
    ) values (
      NEW.workspace_id,
      NEW.campaign_id,
      NEW.lead_id,
      true,
      NEW.id,
      coalesce(NEW.received_at, NEW.created_at),
      coalesce(NEW.ai_stop_followups, false),
      case when NEW.ai_stop_followups then coalesce(NEW.received_at, NEW.created_at) else null end,
      case when NEW.ai_stop_followups then NEW.id else null end
    );
  else
    update campaign_lead_state
    set
      replied = true,
      last_reply_id = NEW.id,
      last_replied_at = coalesce(NEW.received_at, NEW.created_at),
      stop_followups = existing_state.stop_followups or coalesce(NEW.ai_stop_followups, false),
      stopped_at = case
        when existing_state.stop_followups or coalesce(NEW.ai_stop_followups, false) then
          coalesce(existing_state.stopped_at, NEW.received_at, NEW.created_at)
        else
          existing_state.stopped_at
      end,
      stopped_by_reply_id = case
        when existing_state.stop_followups or coalesce(NEW.ai_stop_followups, false) then
          coalesce(existing_state.stopped_by_reply_id, NEW.id)
        else
          existing_state.stopped_by_reply_id
      end
    where workspace_id = NEW.workspace_id
      and campaign_id = NEW.campaign_id
      and lead_id = NEW.lead_id;
  end if;

  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_apply_reply_to_campaign_lead_state
on reply_logs;

create trigger trg_apply_reply_to_campaign_lead_state
after insert on reply_logs
for each row
execute procedure apply_reply_to_campaign_lead_state();

