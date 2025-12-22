-- Campaign Steps with per-lead progression tracking
-- Implements step-based sequences with per-lead step tracking

-- 1. Update campaign_steps table to add subject_template and body_template if needed
do $$
begin
  -- Add subject_template if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaign_steps' and column_name = 'subject_template') then
    alter table campaign_steps add column subject_template text;
    -- Copy from subject if it exists
    update campaign_steps set subject_template = subject where subject_template is null;
    alter table campaign_steps alter column subject_template set not null;
  end if;
  
  -- Add body_template if missing  
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaign_steps' and column_name = 'body_template') then
    alter table campaign_steps add column body_template text;
    -- Copy from body if it exists
    update campaign_steps set body_template = body where body_template is null;
    alter table campaign_steps alter column body_template set not null;
  end if;
end $$;

-- Track each lead's current step within a campaign
alter table campaign_leads
  add column if not exists current_step int default 1,
  add column if not exists last_step_sent_at timestamptz;

create index if not exists idx_cl_progress on campaign_leads(campaign_id, current_step);

-- 2. Create RPC to update the most-recent queued row for a (campaign, lead)
create or replace function update_next_step_queue(
  p_campaign_id uuid,
  p_lead_id uuid,
  p_subject text,
  p_body text,
  p_not_before timestamptz
) returns void language plpgsql as $$
begin
  update send_queue
  set subject = p_subject, body = p_body, not_before = p_not_before
  where id = (
    select id from send_queue
    where campaign_id = p_campaign_id and lead_id = p_lead_id and state='Queued'
    order by created_at desc limit 1
  );
end;
$$;

-- 3. RLS policies for campaign_steps
alter table campaign_steps enable row level security;

drop policy if exists "campaign_steps_select" on campaign_steps;
create policy "campaign_steps_select" on campaign_steps
  for select using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_steps.campaign_id
      and (
        c.user_id = auth.uid() or
        exists (
          select 1 from workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "campaign_steps_modify" on campaign_steps;
create policy "campaign_steps_modify" on campaign_steps
  for all using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_steps.campaign_id
      and (
        c.user_id = auth.uid() or
        exists (
          select 1 from workspace_members wm
          where wm.workspace_id = c.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );

-- 4. Auto-cancel queued follow-ups when lead replies
create or replace function cancel_future_steps_on_reply_campaign_leads()
returns trigger as $$
begin
  -- Triggered when campaign_leads.state changes to 'Replied'
  if new.state = 'Replied' and old.state is distinct from 'Replied' then
    -- Cancel queued follow-ups for this lead in this campaign
    update send_queue
    set state = 'Skipped', error = 'Lead replied; sequence paused'
    where campaign_id = new.campaign_id
      and lead_id = new.lead_id
      and state = 'Queued';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cancel_steps_on_reply_cl on campaign_leads;
create trigger trg_cancel_steps_on_reply_cl
  after update of state on campaign_leads
  for each row
  execute procedure cancel_future_steps_on_reply_campaign_leads();

