-- Campaign Sequence System
-- Defines per-campaign steps (Day 0, Day 3, Day 7...) and tracks per-lead progress

-- Campaign-level sequence definition
create table if not exists campaign_steps (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  step_number int not null,                        -- 1,2,3...
  delay_days int not null default 0,               -- from prior step (or Day 0 for step 1)
  subject text not null,
  body text not null,
  active boolean not null default true,
  window_start time not null default '08:00',
  window_end   time not null default '17:00',
  created_at timestamptz default now(),
  unique (campaign_id, step_number)
);

-- Track per-lead progress through steps
create table if not exists lead_step_states (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  step_number int not null,
  state text not null default 'pending',          -- pending | queued | sent | skipped | canceled
  queue_id uuid references send_queue(id) on delete set null,
  sent_at timestamptz,
  canceled_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (campaign_id, lead_id, step_number)
);

-- Trigger to update updated_at on lead_step_states
create or replace function set_updated_at_lss()
returns trigger as $$ 
begin 
  new.updated_at = now(); 
  return new; 
end; 
$$ language plpgsql;

drop trigger if exists trg_lss_upd on lead_step_states;
create trigger trg_lss_upd 
  before update on lead_step_states
  for each row 
  execute procedure set_updated_at_lss();

-- Helpful indexes
create index if not exists idx_lss_campaign_lead on lead_step_states(campaign_id, lead_id);
create index if not exists idx_lss_state on lead_step_states(state);
create index if not exists idx_campaign_steps_campaign on campaign_steps(campaign_id);

-- Ensure send_queue has idempotency_key column for step tracking
do $$
begin
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'idempotency_key') then
    alter table public.send_queue add column idempotency_key text;
  end if;
  
  -- Add org_id if missing (used in enqueue route)
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'org_id') then
    alter table public.send_queue add column org_id uuid;
  end if;
end $$;

-- Add index for idempotency_key lookups
create index if not exists idx_send_queue_idempotency on public.send_queue(idempotency_key);

-- Ensure leads table has unsubscribed_at and bounced_at columns
do $$
begin
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'leads' and column_name = 'unsubscribed_at') then
    alter table public.leads add column unsubscribed_at timestamptz;
  end if;
  
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'leads' and column_name = 'bounced_at') then
    alter table public.leads add column bounced_at timestamptz;
  end if;
end $$;

-- Auto-cancel future steps when lead replies
create or replace function cancel_future_steps_on_reply()
returns trigger as $$
begin
  -- Triggered when leads.status changes to 'Replied' or when reply_detected is set
  if (new.status = 'Replied' or new.reply_detected = true) 
     and (old.status is distinct from 'Replied' and old.reply_detected is distinct from true) then
    -- Cancel pending/queued lead steps
    update lead_step_states
      set state = 'canceled', canceled_reason = 'replied'
      where lead_id = new.id
        and state in ('pending','queued');

    -- Pause queue items that haven't sent yet
    update send_queue
      set status = 'paused', last_error = 'Lead replied; sequence paused'
      where lead_id = new.id and status in ('queued','sending');
  end if;
  return new;
end;
$$ language plpgsql;

-- Attach trigger to leads table
drop trigger if exists trg_cancel_steps_on_reply on leads;
create trigger trg_cancel_steps_on_reply
  after update of status, reply_detected on leads
  for each row 
  execute procedure cancel_future_steps_on_reply();

-- RLS policies for campaign_steps
alter table public.campaign_steps enable row level security;
alter table public.lead_step_states enable row level security;

-- Allow users to read/write steps for their campaigns
drop policy if exists "campaign_steps_select" on campaign_steps;
create policy "campaign_steps_select"
  on campaign_steps for select
  using (exists (
    select 1 from campaigns c 
    where c.id = campaign_steps.campaign_id 
    and (c.user_id = auth.uid() or exists (
      select 1 from workspace_members wm 
      where wm.workspace_id = c.workspace_id 
      and wm.user_id = auth.uid()
    ))
  ));

drop policy if exists "campaign_steps_modify" on campaign_steps;
create policy "campaign_steps_modify"
  on campaign_steps for all
  using (exists (
    select 1 from campaigns c 
    where c.id = campaign_steps.campaign_id 
    and (c.user_id = auth.uid() or exists (
      select 1 from workspace_members wm 
      where wm.workspace_id = c.workspace_id 
      and wm.user_id = auth.uid()
    ))
  ));

-- Allow users to read lead_step_states for their campaigns
drop policy if exists "lead_step_states_select" on lead_step_states;
create policy "lead_step_states_select"
  on lead_step_states for select
  using (exists (
    select 1 from campaigns c 
    where c.id = lead_step_states.campaign_id 
    and (c.user_id = auth.uid() or exists (
      select 1 from workspace_members wm 
      where wm.workspace_id = c.workspace_id 
      and wm.user_id = auth.uid()
    ))
  ));

drop policy if exists "lead_step_states_modify" on lead_step_states;
create policy "lead_step_states_modify"
  on lead_step_states for all
  using (exists (
    select 1 from campaigns c 
    where c.id = lead_step_states.campaign_id 
    and (c.user_id = auth.uid() or exists (
      select 1 from workspace_members wm 
      where wm.workspace_id = c.workspace_id 
      and wm.user_id = auth.uid()
    ))
  ));

