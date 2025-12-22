-- Campaign Steps: Multi-step sequence with per-lead progression
-- This migration creates/updates campaign_steps table and adds progression tracking to campaign_leads

-- 1. Create campaign_steps table if it doesn't exist
create table if not exists campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  step_no int not null,                               -- 1,2,3...
  subject_template text not null,
  body_template text not null,
  delay_days int not null default 0,                  -- when to send after previous step
  active boolean default true,
  created_at timestamptz default now(),
  unique (campaign_id, step_no)
);

-- Update existing campaign_steps if they have different column names
do $$
begin
  -- If subject_template doesn't exist, try to add it from subject
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaign_steps' and column_name = 'subject_template') then
    -- Add subject_template
    alter table campaign_steps add column subject_template text;
    -- Copy from subject if it exists
    if exists (select 1 from information_schema.columns 
               where table_name = 'campaign_steps' and column_name = 'subject') then
      update campaign_steps set subject_template = subject where subject_template is null;
    end if;
    alter table campaign_steps alter column subject_template set not null;
  end if;
  
  -- If body_template doesn't exist, try to add it from body
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaign_steps' and column_name = 'body_template') then
    -- Add body_template
    alter table campaign_steps add column body_template text;
    -- Copy from body if it exists
    if exists (select 1 from information_schema.columns 
               where table_name = 'campaign_steps' and column_name = 'body') then
      update campaign_steps set body_template = body where body_template is null;
    end if;
    alter table campaign_steps alter column body_template set not null;
  end if;
  
  -- If delay_days doesn't exist, add it (convert from delay_hours if needed)
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaign_steps' and column_name = 'delay_days') then
    alter table campaign_steps add column delay_days int not null default 0;
    -- Convert delay_hours to delay_days if it exists
    if exists (select 1 from information_schema.columns 
               where table_name = 'campaign_steps' and column_name = 'delay_hours') then
      update campaign_steps set delay_days = delay_hours / 24 where delay_days = 0;
    end if;
  end if;
  
  -- If step_no doesn't exist, try to migrate from step_number
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaign_steps' and column_name = 'step_no') then
    if exists (select 1 from information_schema.columns 
               where table_name = 'campaign_steps' and column_name = 'step_number') then
      alter table campaign_steps add column step_no int;
      update campaign_steps set step_no = step_number;
      alter table campaign_steps alter column step_no set not null;
      alter table campaign_steps drop constraint if exists campaign_steps_campaign_id_step_no_key;
      create unique index if not exists campaign_steps_campaign_id_step_no_key on campaign_steps(campaign_id, step_no);
    end if;
  end if;
  
  -- Ensure active column exists
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaign_steps' and column_name = 'active') then
    alter table campaign_steps add column active boolean default true;
  end if;
end $$;

-- 2. Track each lead's current step within a campaign
alter table campaign_leads
  add column if not exists current_step int default 1,
  add column if not exists last_step_sent_at timestamptz;

create index if not exists idx_cl_progress on campaign_leads(campaign_id, current_step);

-- 3. Create RPC to update the most-recent queued row for a (campaign, lead)
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

-- 4. RLS policies for campaign_steps
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

-- 5. Auto-cancel queued follow-ups when lead replies
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

-- 6. Also cancel when leads.status becomes 'Replied'
create or replace function cancel_future_steps_on_lead_reply()
returns trigger as $$
begin
  if new.status = 'Replied' and old.status is distinct from 'Replied' then
    -- Cancel queued items for all campaigns for this lead
    update send_queue
    set state = 'Skipped', error = 'Lead replied; sequence paused'
    where lead_id = new.id
      and state = 'Queued';
    
    -- Update campaign_leads state
    update campaign_leads
    set state = 'Replied'
    where lead_id = new.id and state != 'Replied';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cancel_steps_on_lead_reply on leads;
create trigger trg_cancel_steps_on_lead_reply
  after update of status on leads
  for each row
  execute procedure cancel_future_steps_on_lead_reply();









