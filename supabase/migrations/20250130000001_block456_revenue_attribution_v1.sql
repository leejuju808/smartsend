-- Block 456 — Revenue Attribution v1
-- Meetings • Deals • Revenue • Sequence → Revenue Mapping • Inbox/ICP Value • Team Value Tracking
-- This block adds revenue attribution to SmartSend, upgrading it from an outbound engine to a sales intelligence system.

-- ============================================================================
-- 1️⃣ Meetings Table
-- ============================================================================

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booked_at timestamptz not null default now(),
  source text not null default 'smartsend' check (source in ('smartsend', 'manual', 'crm', 'inbound', 'webhook')),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'no_show', 'canceled')),
  created_by uuid references public.profiles(id) on delete set null,
  
  -- Attribution fields
  campaign_id uuid references public.campaigns(id) on delete set null,
  step_id uuid references public.campaign_steps(id) on delete set null,
  variant_id uuid references public.step_variants(id) on delete set null,
  inbox_id uuid references public.sender_inboxes(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  segment_id uuid references public.segments(id) on delete set null,
  reply_intent_type text, -- 'interested', 'maybe', etc.
  
  -- Meeting details
  meeting_title text,
  meeting_notes text,
  meeting_link text,
  meeting_duration_minutes int,
  meeting_outcome text, -- 'qualified', 'not_qualified', 'follow_up', etc.
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_meetings_lead on public.meetings(lead_id);
create index if not exists idx_meetings_workspace on public.meetings(workspace_id);
create index if not exists idx_meetings_campaign on public.meetings(campaign_id) where campaign_id is not null;
create index if not exists idx_meetings_step on public.meetings(step_id) where step_id is not null;
create index if not exists idx_meetings_variant on public.meetings(variant_id) where variant_id is not null;
create index if not exists idx_meetings_inbox on public.meetings(inbox_id) where inbox_id is not null;
create index if not exists idx_meetings_owner on public.meetings(owner_id) where owner_id is not null;
create index if not exists idx_meetings_segment on public.meetings(segment_id) where segment_id is not null;
create index if not exists idx_meetings_booked_at on public.meetings(booked_at desc);
create index if not exists idx_meetings_status on public.meetings(status);

-- ============================================================================
-- 2️⃣ Deals Table
-- ============================================================================

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  deal_name text not null,
  value numeric not null default 0 check (value >= 0),
  currency text not null default 'USD',
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  forecast_category text check (forecast_category in ('pipeline', 'commit', 'closed', 'best_case')),
  
  -- Attribution fields
  campaign_id uuid references public.campaigns(id) on delete set null,
  step_id uuid references public.campaign_steps(id) on delete set null,
  variant_id uuid references public.step_variants(id) on delete set null,
  inbox_id uuid references public.sender_inboxes(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  segment_id uuid references public.segments(id) on delete set null,
  reply_intent_type text,
  meeting_id uuid references public.meetings(id) on delete set null,
  
  -- Deal details
  close_date timestamptz,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  deal_stage text, -- 'discovery', 'proposal', 'negotiation', 'closed', etc.
  probability int check (probability >= 0 and probability <= 100),
  expected_close_date timestamptz,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deals_lead on public.deals(lead_id);
create index if not exists idx_deals_workspace on public.deals(workspace_id);
create index if not exists idx_deals_campaign on public.deals(campaign_id) where campaign_id is not null;
create index if not exists idx_deals_step on public.deals(step_id) where step_id is not null;
create index if not exists idx_deals_variant on public.deals(variant_id) where variant_id is not null;
create index if not exists idx_deals_inbox on public.deals(inbox_id) where inbox_id is not null;
create index if not exists idx_deals_owner on public.deals(owner_id) where owner_id is not null;
create index if not exists idx_deals_segment on public.deals(segment_id) where segment_id is not null;
create index if not exists idx_deals_status on public.deals(status);
create index if not exists idx_deals_status_value on public.deals(status, value) where status = 'won';
create index if not exists idx_deals_close_date on public.deals(close_date desc nulls last);
create index if not exists idx_deals_meeting on public.deals(meeting_id) where meeting_id is not null;

-- ============================================================================
-- 3️⃣ Add Attribution Fields to Leads Table
-- ============================================================================

-- Add attribution columns to leads if they don't exist
alter table public.leads
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists step_id uuid references public.campaign_steps(id) on delete set null,
  add column if not exists variant_id uuid references public.step_variants(id) on delete set null,
  add column if not exists inbox_id uuid references public.sender_inboxes(id) on delete set null,
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists segment_id uuid references public.segments(id) on delete set null,
  add column if not exists reply_intent_type text;

-- Create indexes for attribution fields
create index if not exists idx_leads_campaign_attribution on public.leads(campaign_id) where campaign_id is not null;
create index if not exists idx_leads_step_attribution on public.leads(step_id) where step_id is not null;
create index if not exists idx_leads_variant_attribution on public.leads(variant_id) where variant_id is not null;
create index if not exists idx_leads_inbox_attribution on public.leads(inbox_id) where inbox_id is not null;
create index if not exists idx_leads_owner_attribution on public.leads(owner_id) where owner_id is not null;
create index if not exists idx_leads_segment_attribution on public.leads(segment_id) where segment_id is not null;

-- ============================================================================
-- 4️⃣ Helper Function: Update Lead Attribution from Reply Intent
-- ============================================================================

-- Function to update lead attribution when reply intent is classified
-- This is called when a lead replies with "interested" or "maybe" intent
create or replace function public.update_lead_attribution_from_reply(
  p_lead_id uuid,
  p_campaign_id uuid,
  p_reply_intent text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step_id uuid;
  v_variant_id uuid;
  v_inbox_id uuid;
  v_owner_id uuid;
  v_segment_id uuid;
begin
  -- Only update attribution for "interested" or "maybe" replies
  if p_reply_intent not in ('interested', 'maybe') then
    return;
  end if;

  -- Get attribution from the most recent send_log/send_queue for this lead and campaign
  -- Try send_queue first (more complete attribution), then fallback to send_logs
  select 
    sq.step_id,
    sq.variant_id,
    sq.sender_inbox_id,
    l.owner_id,
    l.segment_id
  into 
    v_step_id,
    v_variant_id,
    v_inbox_id,
    v_owner_id,
    v_segment_id
  from public.send_queue sq
  join public.leads l on l.id = sq.lead_id
  where sq.lead_id = p_lead_id
    and sq.campaign_id = p_campaign_id
    and sq.status = 'sent'
  order by sq.sent_at desc
  limit 1;
  
  -- If not found in send_queue, try send_logs
  if v_step_id is null then
    select 
      sl.step_id,
      sl.variant_id,
      null::uuid, -- send_logs doesn't have sender_inbox_id directly
      l.owner_id,
      l.segment_id
    into 
      v_step_id,
      v_variant_id,
      v_inbox_id,
      v_owner_id,
      v_segment_id
    from public.send_logs sl
    join public.leads l on l.id = sl.lead_id
    where sl.lead_id = p_lead_id
      and sl.campaign_id = p_campaign_id
      and sl.status = 'sent'
    order by sl.sent_at desc
    limit 1;
  end if;

  -- Update lead attribution fields (only if not already set)
  update public.leads
  set
    campaign_id = coalesce(campaign_id, p_campaign_id),
    step_id = coalesce(step_id, v_step_id),
    variant_id = coalesce(variant_id, v_variant_id),
    inbox_id = coalesce(inbox_id, v_inbox_id),
    owner_id = coalesce(owner_id, v_owner_id),
    segment_id = coalesce(segment_id, v_segment_id),
    reply_intent_type = p_reply_intent,
    updated_at = now()
  where id = p_lead_id;
end;
$$;

-- ============================================================================
-- 5️⃣ Helper Function: Auto-Attribute Meeting from Lead
-- ============================================================================

create or replace function public.auto_attribute_meeting_from_lead(
  p_lead_id uuid,
  p_meeting_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_step_id uuid;
  v_variant_id uuid;
  v_inbox_id uuid;
  v_owner_id uuid;
  v_segment_id uuid;
  v_reply_intent_type text;
  v_workspace_id uuid;
begin
  -- Get attribution from lead
  select 
    l.campaign_id,
    l.step_id,
    l.variant_id,
    l.inbox_id,
    l.owner_id,
    l.segment_id,
    le.reply_intent,
    l.workspace_id
  into 
    v_campaign_id,
    v_step_id,
    v_variant_id,
    v_inbox_id,
    v_owner_id,
    v_segment_id,
    v_reply_intent_type,
    v_workspace_id
  from public.leads l
  left join public.lead_engagement le on le.lead_id = l.id
  where l.id = p_lead_id;

  -- Update meeting with attribution
  update public.meetings
  set
    campaign_id = coalesce(campaign_id, v_campaign_id),
    step_id = coalesce(step_id, v_step_id),
    variant_id = coalesce(variant_id, v_variant_id),
    inbox_id = coalesce(inbox_id, v_inbox_id),
    owner_id = coalesce(owner_id, v_owner_id),
    segment_id = coalesce(segment_id, v_segment_id),
    reply_intent_type = coalesce(reply_intent_type, v_reply_intent_type),
    updated_at = now()
  where id = p_meeting_id;
end;
$$;

-- ============================================================================
-- 6️⃣ Helper Function: Auto-Attribute Deal from Lead/Meeting
-- ============================================================================

create or replace function public.auto_attribute_deal_from_lead(
  p_lead_id uuid,
  p_deal_id uuid,
  p_meeting_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_step_id uuid;
  v_variant_id uuid;
  v_inbox_id uuid;
  v_owner_id uuid;
  v_segment_id uuid;
  v_reply_intent_type text;
  v_workspace_id uuid;
  v_meeting_campaign_id uuid;
  v_meeting_step_id uuid;
  v_meeting_variant_id uuid;
begin
  -- Try to get attribution from meeting first (more specific)
  if p_meeting_id is not null then
    select 
      campaign_id,
      step_id,
      variant_id,
      inbox_id,
      owner_id,
      segment_id,
      reply_intent_type
    into 
      v_meeting_campaign_id,
      v_meeting_step_id,
      v_meeting_variant_id,
      v_inbox_id,
      v_owner_id,
      v_segment_id,
      v_reply_intent_type
    from public.meetings
    where id = p_meeting_id;
  end if;

  -- Fallback to lead attribution
  select 
    l.campaign_id,
    l.step_id,
    l.variant_id,
    l.inbox_id,
    l.owner_id,
    l.segment_id,
    le.reply_intent,
    l.workspace_id
  into 
    v_campaign_id,
    v_step_id,
    v_variant_id,
    v_inbox_id,
    v_owner_id,
    v_segment_id,
    v_reply_intent_type,
    v_workspace_id
  from public.leads l
  left join public.lead_engagement le on le.lead_id = l.id
  where l.id = p_lead_id;

  -- Update deal with attribution (prefer meeting attribution)
  update public.deals
  set
    campaign_id = coalesce(campaign_id, v_meeting_campaign_id, v_campaign_id),
    step_id = coalesce(step_id, v_meeting_step_id, v_step_id),
    variant_id = coalesce(variant_id, v_meeting_variant_id, v_variant_id),
    inbox_id = coalesce(inbox_id, v_inbox_id),
    owner_id = coalesce(owner_id, v_owner_id),
    segment_id = coalesce(segment_id, v_segment_id),
    reply_intent_type = coalesce(reply_intent_type, v_reply_intent_type),
    meeting_id = coalesce(meeting_id, p_meeting_id),
    updated_at = now()
  where id = p_deal_id;
end;
$$;

-- ============================================================================
-- 7️⃣ Trigger: Auto-Attribute Meeting on Insert
-- ============================================================================

create or replace function public.trg_auto_attribute_meeting()
returns trigger
language plpgsql
as $$
begin
  -- Auto-attribute if attribution fields are not already set
  if new.campaign_id is null or new.step_id is null then
    perform public.auto_attribute_meeting_from_lead(new.lead_id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_meetings_auto_attribute on public.meetings;
create trigger trg_meetings_auto_attribute
  after insert on public.meetings
  for each row
  execute function public.trg_auto_attribute_meeting();

-- ============================================================================
-- 8️⃣ Trigger: Auto-Attribute Deal on Insert
-- ============================================================================

create or replace function public.trg_auto_attribute_deal()
returns trigger
language plpgsql
as $$
begin
  -- Auto-attribute if attribution fields are not already set
  if new.campaign_id is null or new.step_id is null then
    perform public.auto_attribute_deal_from_lead(new.lead_id, new.id, new.meeting_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_deals_auto_attribute on public.deals;
create trigger trg_deals_auto_attribute
  after insert on public.deals
  for each row
  execute function public.trg_auto_attribute_deal();

-- ============================================================================
-- 8️⃣ Update Triggers for updated_at
-- ============================================================================

create trigger trg_meetings_updated_at
before update on public.meetings
for each row
execute function public.set_updated_at();

create trigger trg_deals_updated_at
before update on public.deals
for each row
execute function public.set_updated_at();

-- ============================================================================
-- 🔟 Revenue Dashboard Views
-- ============================================================================

-- Revenue KPIs View
create or replace view public.v_revenue_kpis as
select 
  w.id as workspace_id,
  count(distinct m.id) as meetings_booked,
  count(distinct d.id) as deals_created,
  count(distinct d.id) filter (where d.status = 'won') as deals_won,
  coalesce(sum(d.value) filter (where d.status = 'won'), 0) as revenue_closed,
  coalesce(sum(d.value) filter (where d.status = 'open'), 0) as pipeline_value,
  case 
    when count(distinct d.id) > 0 
    then round((count(distinct d.id) filter (where d.status = 'won')::numeric / count(distinct d.id)::numeric) * 100, 1)
    else 0
  end as win_rate,
  case 
    when count(distinct d.id) filter (where d.status = 'won') > 0
    then round(coalesce(sum(d.value) filter (where d.status = 'won'), 0) / count(distinct d.id) filter (where d.status = 'won'), 0)
    else 0
  end as avg_deal_size
from public.workspaces w
left join public.meetings m on m.workspace_id = w.id
left join public.deals d on d.workspace_id = w.id
group by w.id;

-- Revenue by Campaign View
create or replace view public.v_revenue_by_campaign as
select 
  c.id as campaign_id,
  c.name as campaign_name,
  c.workspace_id,
  count(distinct m.id) as meetings_booked,
  count(distinct d.id) as deals_created,
  count(distinct d.id) filter (where d.status = 'won') as deals_won,
  coalesce(sum(d.value) filter (where d.status = 'won'), 0) as revenue_closed,
  coalesce(sum(d.value) filter (where d.status = 'open'), 0) as pipeline_value
from public.campaigns c
left join public.meetings m on m.campaign_id = c.id
left join public.deals d on d.campaign_id = c.id
group by c.id, c.name, c.workspace_id;

-- Revenue by Sequence Step View
create or replace view public.v_revenue_by_step as
select 
  cs.id as step_id,
  cs.name as step_name,
  cs.campaign_id,
  count(distinct m.id) as meetings_booked,
  count(distinct d.id) as deals_created,
  count(distinct d.id) filter (where d.status = 'won') as deals_won,
  coalesce(sum(d.value) filter (where d.status = 'won'), 0) as revenue_closed,
  coalesce(sum(d.value) filter (where d.status = 'open'), 0) as pipeline_value
from public.campaign_steps cs
left join public.meetings m on m.step_id = cs.id
left join public.deals d on d.step_id = cs.id
group by cs.id, cs.name, cs.campaign_id;

-- Revenue by Variant View
create or replace view public.v_revenue_by_variant as
select 
  sv.id as variant_id,
  sv.name as variant_name,
  sv.step_id,
  cs.campaign_id,
  count(distinct m.id) as meetings_booked,
  count(distinct d.id) as deals_created,
  count(distinct d.id) filter (where d.status = 'won') as deals_won,
  coalesce(sum(d.value) filter (where d.status = 'won'), 0) as revenue_closed
from public.step_variants sv
join public.campaign_steps cs on cs.id = sv.step_id
left join public.meetings m on m.variant_id = sv.id
left join public.deals d on d.variant_id = sv.id
group by sv.id, sv.name, sv.step_id, cs.campaign_id;

-- SDR Revenue Leaderboard View
create or replace view public.v_sdr_revenue_leaderboard as
select 
  p.id as sdr_id,
  p.full_name as sdr_name,
  p.email as sdr_email,
  w.id as workspace_id,
  count(distinct m.id) as meetings_booked,
  count(distinct d.id) as deals_created,
  count(distinct d.id) filter (where d.status = 'won') as deals_won,
  coalesce(sum(d.value) filter (where d.status = 'won'), 0) as revenue_closed
from public.profiles p
join public.workspace_members wm on wm.user_id = p.id
join public.workspaces w on w.id = wm.workspace_id
left join public.meetings m on m.owner_id = p.id and m.workspace_id = w.id
left join public.deals d on d.owner_id = p.id and d.workspace_id = w.id
group by p.id, p.full_name, p.email, w.id
having count(distinct m.id) > 0 or count(distinct d.id) > 0
order by revenue_closed desc;

-- Revenue by Inbox View
create or replace view public.v_revenue_by_inbox as
select 
  si.id as inbox_id,
  si.email as inbox_email,
  sd.domain as inbox_domain,
  si.workspace_id,
  count(distinct m.id) as meetings_booked,
  count(distinct d.id) as deals_created,
  count(distinct d.id) filter (where d.status = 'won') as deals_won,
  coalesce(sum(d.value) filter (where d.status = 'won'), 0) as revenue_closed
from public.sender_inboxes si
join public.sender_domains sd on sd.id = si.domain_id
left join public.meetings m on m.inbox_id = si.id
left join public.deals d on d.inbox_id = si.id
group by si.id, si.email, sd.domain, si.workspace_id;

-- Revenue by Domain View
create or replace view public.v_revenue_by_domain as
select 
  sd.id as domain_id,
  sd.domain,
  sd.workspace_id,
  count(distinct m.id) as meetings_booked,
  count(distinct d.id) as deals_created,
  count(distinct d.id) filter (where d.status = 'won') as deals_won,
  coalesce(sum(d.value) filter (where d.status = 'won'), 0) as revenue_closed
from public.sender_domains sd
left join public.sender_inboxes si on si.domain_id = sd.id
left join public.meetings m on m.inbox_id = si.id
left join public.deals d on d.inbox_id = si.id
group by sd.id, sd.domain, sd.workspace_id;

-- Revenue by Segment/ICP View
create or replace view public.v_revenue_by_segment as
select 
  s.id as segment_id,
  s.name as segment_name,
  s.account_id,
  count(distinct m.id) as meetings_booked,
  count(distinct d.id) as deals_created,
  count(distinct d.id) filter (where d.status = 'won') as deals_won,
  coalesce(sum(d.value) filter (where d.status = 'won'), 0) as revenue_closed
from public.segments s
left join public.meetings m on m.segment_id = s.id
left join public.deals d on d.segment_id = s.id
group by s.id, s.name, s.account_id;

-- Pipeline Forecast View (Next 30/60 Days)
create or replace view public.v_pipeline_forecast as
select 
  w.id as workspace_id,
  coalesce(sum(d.value) filter (
    where d.status = 'open' 
    and d.expected_close_date >= now() 
    and d.expected_close_date <= now() + interval '30 days'
  ), 0) as forecast_30d,
  coalesce(sum(d.value) filter (
    where d.status = 'open' 
    and d.expected_close_date >= now() 
    and d.expected_close_date <= now() + interval '60 days'
  ), 0) as forecast_60d,
  coalesce(sum(d.value) filter (
    where d.status = 'open' 
    and d.forecast_category = 'commit'
  ), 0) as committed_pipeline,
  coalesce(sum(d.value) filter (
    where d.status = 'open' 
    and d.forecast_category = 'best_case'
  ), 0) as best_case_pipeline
from public.workspaces w
left join public.deals d on d.workspace_id = w.id
group by w.id;

-- ============================================================================
-- 1️⃣1️⃣ RLS Policies
-- ============================================================================

alter table public.meetings enable row level security;
alter table public.deals enable row level security;

-- Meetings RLS: Workspace members can read/write their workspace meetings
create policy "meetings_select_workspace_member" on public.meetings
  for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = meetings.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "meetings_insert_workspace_member" on public.meetings
  for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = meetings.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "meetings_update_workspace_member" on public.meetings
  for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = meetings.workspace_id
      and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = meetings.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "meetings_delete_workspace_member" on public.meetings
  for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = meetings.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Deals RLS: Workspace members can read/write their workspace deals
create policy "deals_select_workspace_member" on public.deals
  for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = deals.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "deals_insert_workspace_member" on public.deals
  for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = deals.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "deals_update_workspace_member" on public.deals
  for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = deals.workspace_id
      and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = deals.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "deals_delete_workspace_member" on public.deals
  for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = deals.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Service role can do everything
create policy "meetings_service_role" on public.meetings
  for all
  to service_role
  using (true)
  with check (true);

create policy "deals_service_role" on public.deals
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 1️⃣2️⃣ Grant Permissions
-- ============================================================================

grant execute on function public.update_lead_attribution_from_reply(uuid, uuid, text) to service_role;
grant execute on function public.auto_attribute_meeting_from_lead(uuid, uuid) to service_role;
grant execute on function public.auto_attribute_deal_from_lead(uuid, uuid, uuid) to service_role;

-- ============================================================================
-- 1️⃣3️⃣ Integration with Optimizer (Block 455)
-- ============================================================================

-- Add revenue correlation to step_score table if it doesn't exist
alter table public.step_score
  add column if not exists revenue_correlation_score int check (revenue_correlation_score >= 0 and revenue_correlation_score <= 100);

-- Function to calculate revenue correlation for a step
create or replace function public.calculate_step_revenue_correlation(p_step_id uuid)
returns int
language plpgsql
stable
as $$
declare
  v_revenue_score int;
  v_total_revenue numeric;
  v_step_revenue numeric;
  v_total_meetings int;
  v_step_meetings int;
begin
  -- Get total revenue and meetings for the campaign
  select 
    coalesce(sum(d.value) filter (where d.status = 'won'), 0),
    count(distinct m.id)
  into v_total_revenue, v_total_meetings
  from public.campaign_steps cs
  join public.campaigns c on c.id = cs.campaign_id
  left join public.deals d on d.campaign_id = c.id
  left join public.meetings m on m.campaign_id = c.id
  where cs.id = p_step_id;

  -- Get step-specific revenue and meetings
  select 
    coalesce(sum(d.value) filter (where d.status = 'won'), 0),
    count(distinct m.id)
  into v_step_revenue, v_step_meetings
  from public.deals d
  full outer join public.meetings m on m.step_id = p_step_id
  where d.step_id = p_step_id or m.step_id = p_step_id;

  -- Calculate correlation score (0-100)
  -- Strong correlation if step generates significant portion of revenue
  if v_total_revenue > 0 and v_total_meetings > 0 then
    v_revenue_score := least(100, round(
      ((v_step_revenue / nullif(v_total_revenue, 0)) * 50 + 
       (v_step_meetings::numeric / nullif(v_total_meetings, 0)) * 50)::numeric
    ));
  else
    v_revenue_score := 0;
  end if;

  return coalesce(v_revenue_score, 0);
end;
$$;

-- ============================================================================
-- Block 456 Complete ✅
-- ============================================================================

