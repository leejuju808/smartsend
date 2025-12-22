-- Block 466 — Multi-Brand Manager v1
-- Multiple Domains • Multiple Brand Identities • Per-Brand Assets • Per-Brand Sequences • Unified Workspace Control
-- This block introduces brand-level control inside one workspace, enabling agencies, SMBs, and founders to manage multiple brands

-- ============================================================================
-- 1️⃣ BRANDS TABLE
-- ============================================================================

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  color_primary text,
  color_secondary text,
  logo_url text,
  from_name text,
  default_signature text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  unique(workspace_id, name)
);

create index if not exists idx_brands_workspace on public.brands(workspace_id);
create index if not exists idx_brands_name on public.brands(name);

-- Trigger to update updated_at
create trigger trg_brands_updated_at
before update on public.brands
for each row
execute function public.set_updated_at();

-- ============================================================================
-- 2️⃣ ADD BRAND_ID TO ALL RELEVANT TABLES
-- ============================================================================

-- Sequences
alter table public.sequences
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_sequences_brand on public.sequences(brand_id) where brand_id is not null;

-- Sequence Steps
alter table public.sequence_steps
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_sequence_steps_brand on public.sequence_steps(brand_id) where brand_id is not null;

-- Sender Inboxes
alter table public.sender_inboxes
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_sender_inboxes_brand on public.sender_inboxes(brand_id) where brand_id is not null;

-- Sender Domains
alter table public.sender_domains
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_sender_domains_brand on public.sender_domains(brand_id) where brand_id is not null;

-- Send Queue
alter table public.send_queue
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_send_queue_brand on public.send_queue(brand_id) where brand_id is not null;

-- Warmup Queue
alter table public.warmup_queue
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_warmup_queue_brand on public.warmup_queue(brand_id) where brand_id is not null;

-- Inbox Warmup Status
alter table public.inbox_warmup_status
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_inbox_warmup_status_brand on public.inbox_warmup_status(brand_id) where brand_id is not null;

-- Warmup Metrics History
alter table public.warmup_metrics_history
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_warmup_metrics_history_brand on public.warmup_metrics_history(brand_id) where brand_id is not null;

-- Domain Reputation
alter table public.domain_reputation
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_domain_reputation_brand on public.domain_reputation(brand_id) where brand_id is not null;

-- Inbox Health
alter table public.inbox_health
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_inbox_health_brand on public.inbox_health(brand_id) where brand_id is not null;

-- Workspace Deliverability
alter table public.workspace_deliverability
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_workspace_deliverability_brand on public.workspace_deliverability(brand_id) where brand_id is not null;

-- Lead Engagement (Reply Intent)
alter table public.lead_engagement
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_lead_engagement_brand on public.lead_engagement(brand_id) where brand_id is not null;

-- Lead Routing Rules
alter table public.lead_routing_rules
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_lead_routing_rules_brand on public.lead_routing_rules(brand_id) where brand_id is not null;

-- Meetings (Revenue Attribution)
alter table public.meetings
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_meetings_brand on public.meetings(brand_id) where brand_id is not null;

-- Deals (Revenue Attribution)
alter table public.deals
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_deals_brand on public.deals(brand_id) where brand_id is not null;

-- Predictions
alter table public.predictions
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_predictions_brand on public.predictions(brand_id) where brand_id is not null;

-- Tasks
alter table public.tasks
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_tasks_brand on public.tasks(brand_id) where brand_id is not null;

-- Fleet Manager Activity
alter table public.fleet_manager_activity
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_fleet_manager_activity_brand on public.fleet_manager_activity(brand_id) where brand_id is not null;

-- Fleet Config (per-brand fleet settings)
alter table public.fleet_config
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_fleet_config_brand on public.fleet_config(brand_id) where brand_id is not null;

-- Inbox Limits (Fleet Caps)
alter table public.inbox_limits
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_inbox_limits_brand on public.inbox_limits(brand_id) where brand_id is not null;

-- Campaigns (for brand assignment)
alter table public.campaigns
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_campaigns_brand on public.campaigns(brand_id) where brand_id is not null;

-- Broadcasts
alter table public.broadcasts
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists idx_broadcasts_brand on public.broadcasts(brand_id) where brand_id is not null;

-- ============================================================================
-- 3️⃣ HELPER FUNCTIONS TO AUTO-POPULATE BRAND_ID
-- ============================================================================

-- Function to get brand_id from domain
create or replace function public.get_brand_id_from_domain(p_domain_id uuid)
returns uuid
language plpgsql
stable
as $$
declare
  v_brand_id uuid;
begin
  select brand_id into v_brand_id
  from public.sender_domains
  where id = p_domain_id;
  
  return v_brand_id;
end;
$$;

-- Function to get brand_id from inbox
create or replace function public.get_brand_id_from_inbox(p_inbox_id uuid)
returns uuid
language plpgsql
stable
as $$
declare
  v_brand_id uuid;
begin
  -- First try direct brand_id on inbox
  select brand_id into v_brand_id
  from public.sender_inboxes
  where id = p_inbox_id;
  
  -- If not found, try via domain
  if v_brand_id is null then
    select sd.brand_id into v_brand_id
    from public.sender_inboxes si
    join public.sender_domains sd on sd.id = si.domain_id
    where si.id = p_inbox_id;
  end if;
  
  return v_brand_id;
end;
$$;

-- Function to get brand_id from sequence
create or replace function public.get_brand_id_from_sequence(p_sequence_id uuid)
returns uuid
language plpgsql
stable
as $$
declare
  v_brand_id uuid;
begin
  select brand_id into v_brand_id
  from public.sequences
  where id = p_sequence_id;
  
  return v_brand_id;
end;
$$;

-- Function to get brand_id from campaign
create or replace function public.get_brand_id_from_campaign(p_campaign_id uuid)
returns uuid
language plpgsql
stable
as $$
declare
  v_brand_id uuid;
begin
  select brand_id into v_brand_id
  from public.campaigns
  where id = p_campaign_id;
  
  return v_brand_id;
end;
$$;

-- ============================================================================
-- 4️⃣ TRIGGERS TO AUTO-POPULATE BRAND_ID
-- ============================================================================

-- Trigger: Auto-populate brand_id on sequence_steps from sequence
create or replace function public.trg_sequence_steps_brand_id()
returns trigger
language plpgsql
as $$
declare
  v_brand_id uuid;
begin
  if new.brand_id is null then
    select brand_id into v_brand_id
    from public.sequences
    where id = new.sequence_id;
    
    new.brand_id := v_brand_id;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_sequence_steps_brand_id on public.sequence_steps;
create trigger trg_sequence_steps_brand_id
  before insert or update on public.sequence_steps
  for each row
  execute function public.trg_sequence_steps_brand_id();

-- Trigger: Auto-populate brand_id on sender_inboxes from domain
create or replace function public.trg_sender_inboxes_brand_id()
returns trigger
language plpgsql
as $$
declare
  v_brand_id uuid;
begin
  if new.brand_id is null and new.domain_id is not null then
    select brand_id into v_brand_id
    from public.sender_domains
    where id = new.domain_id;
    
    new.brand_id := v_brand_id;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_sender_inboxes_brand_id on public.sender_inboxes;
create trigger trg_sender_inboxes_brand_id
  before insert or update on public.sender_inboxes
  for each row
  execute function public.trg_sender_inboxes_brand_id();

-- Trigger: Auto-populate brand_id on send_queue from campaign or inbox
create or replace function public.trg_send_queue_brand_id()
returns trigger
language plpgsql
as $$
declare
  v_brand_id uuid;
begin
  if new.brand_id is null then
    -- Try campaign first
    if new.campaign_id is not null then
      select brand_id into v_brand_id
      from public.campaigns
      where id = new.campaign_id;
    end if;
    
    -- Fallback to inbox
    if v_brand_id is null and new.sender_inbox_id is not null then
      select brand_id into v_brand_id
      from public.sender_inboxes
      where id = new.sender_inbox_id;
      
      -- If still null, try via domain
      if v_brand_id is null then
        select sd.brand_id into v_brand_id
        from public.sender_inboxes si
        join public.sender_domains sd on sd.id = si.domain_id
        where si.id = new.sender_inbox_id;
      end if;
    end if;
    
    new.brand_id := v_brand_id;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_send_queue_brand_id on public.send_queue;
create trigger trg_send_queue_brand_id
  before insert or update on public.send_queue
  for each row
  execute function public.trg_send_queue_brand_id();

-- Trigger: Auto-populate brand_id on warmup_queue from inbox
create or replace function public.trg_warmup_queue_brand_id()
returns trigger
language plpgsql
as $$
declare
  v_brand_id uuid;
begin
  if new.brand_id is null and new.inbox_id is not null then
    select brand_id into v_brand_id
    from public.sender_inboxes
    where id = new.inbox_id;
    
    -- If null, try via domain
    if v_brand_id is null then
      select sd.brand_id into v_brand_id
      from public.sender_inboxes si
      join public.sender_domains sd on sd.id = si.domain_id
      where si.id = new.inbox_id;
    end if;
    
    new.brand_id := v_brand_id;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_warmup_queue_brand_id on public.warmup_queue;
create trigger trg_warmup_queue_brand_id
  before insert or update on public.warmup_queue
  for each row
  execute function public.trg_warmup_queue_brand_id();

-- Trigger: Auto-populate brand_id on inbox_health from inbox
create or replace function public.trg_inbox_health_brand_id()
returns trigger
language plpgsql
as $$
declare
  v_brand_id uuid;
begin
  if new.brand_id is null and new.inbox_id is not null then
    select brand_id into v_brand_id
    from public.sender_inboxes
    where id = new.inbox_id;
    
    -- If null, try via domain
    if v_brand_id is null then
      select sd.brand_id into v_brand_id
      from public.sender_inboxes si
      join public.sender_domains sd on sd.id = si.domain_id
      where si.id = new.inbox_id;
    end if;
    
    new.brand_id := v_brand_id;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_inbox_health_brand_id on public.inbox_health;
create trigger trg_inbox_health_brand_id
  before insert or update on public.inbox_health
  for each row
  execute function public.trg_inbox_health_brand_id();

-- Trigger: Auto-populate brand_id on domain_reputation from domain
create or replace function public.trg_domain_reputation_brand_id()
returns trigger
language plpgsql
as $$
declare
  v_brand_id uuid;
begin
  if new.brand_id is null and new.domain_id is not null then
    select brand_id into v_brand_id
    from public.sender_domains
    where id = new.domain_id;
    
    new.brand_id := v_brand_id;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_domain_reputation_brand_id on public.domain_reputation;
create trigger trg_domain_reputation_brand_id
  before insert or update on public.domain_reputation
  for each row
  execute function public.trg_domain_reputation_brand_id();

-- Trigger: Auto-populate brand_id on meetings from campaign or inbox
create or replace function public.trg_meetings_brand_id()
returns trigger
language plpgsql
as $$
declare
  v_brand_id uuid;
begin
  if new.brand_id is null then
    -- Try campaign first
    if new.campaign_id is not null then
      select brand_id into v_brand_id
      from public.campaigns
      where id = new.campaign_id;
    end if;
    
    -- Fallback to inbox
    if v_brand_id is null and new.inbox_id is not null then
      select brand_id into v_brand_id
      from public.sender_inboxes
      where id = new.inbox_id;
    end if;
    
    new.brand_id := v_brand_id;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_meetings_brand_id on public.meetings;
create trigger trg_meetings_brand_id
  before insert or update on public.meetings
  for each row
  execute function public.trg_meetings_brand_id();

-- Trigger: Auto-populate brand_id on deals from campaign or meeting
create or replace function public.trg_deals_brand_id()
returns trigger
language plpgsql
as $$
declare
  v_brand_id uuid;
begin
  if new.brand_id is null then
    -- Try meeting first
    if new.meeting_id is not null then
      select brand_id into v_brand_id
      from public.meetings
      where id = new.meeting_id;
    end if;
    
    -- Fallback to campaign
    if v_brand_id is null and new.campaign_id is not null then
      select brand_id into v_brand_id
      from public.campaigns
      where id = new.campaign_id;
    end if;
    
    new.brand_id := v_brand_id;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_deals_brand_id on public.deals;
create trigger trg_deals_brand_id
  before insert or update on public.deals
  for each row
  execute function public.trg_deals_brand_id();

-- ============================================================================
-- 5️⃣ RLS POLICIES FOR BRANDS
-- ============================================================================

alter table public.brands enable row level security;

-- Brands: Workspace members can view their workspace brands
create policy "brands_select_workspace_member" on public.brands
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = brands.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Brands: Workspace members can insert brands
create policy "brands_insert_workspace_member" on public.brands
  for insert with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = brands.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Brands: Workspace members can update brands
create policy "brands_update_workspace_member" on public.brands
  for update using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = brands.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Brands: Only owners/admins can delete brands
create policy "brands_delete_workspace_admin" on public.brands
  for delete using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = brands.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- ============================================================================
-- 6️⃣ BRAND-LEVEL ANALYTICS VIEWS
-- ============================================================================

-- Brand Revenue Summary View
create or replace view public.v_brand_revenue_summary as
select 
  b.id as brand_id,
  b.name as brand_name,
  b.workspace_id,
  count(distinct m.id) as meetings_booked,
  count(distinct d.id) as deals_created,
  count(distinct d.id) filter (where d.status = 'won') as deals_won,
  coalesce(sum(d.value) filter (where d.status = 'won'), 0) as revenue_closed,
  coalesce(sum(d.value) filter (where d.status = 'open'), 0) as pipeline_value
from public.brands b
left join public.meetings m on m.brand_id = b.id
left join public.deals d on d.brand_id = b.id
group by b.id, b.name, b.workspace_id;

-- Brand Deliverability Summary View
create or replace view public.v_brand_deliverability_summary as
select 
  b.id as brand_id,
  b.name as brand_name,
  b.workspace_id,
  count(distinct sd.id) as domains_count,
  count(distinct si.id) as inboxes_count,
  avg(ih.score) as avg_inbox_health_score,
  avg(dr.reputation_score) as avg_domain_reputation,
  count(distinct ih.id) filter (where ih.score < 60) as risky_inboxes_count
from public.brands b
left join public.sender_domains sd on sd.brand_id = b.id
left join public.sender_inboxes si on si.brand_id = b.id
left join public.inbox_health ih on ih.brand_id = b.id
left join public.domain_reputation dr on dr.brand_id = b.id
group by b.id, b.name, b.workspace_id;

-- Brand Fleet Summary View
create or replace view public.v_brand_fleet_summary as
select 
  b.id as brand_id,
  b.name as brand_name,
  b.workspace_id,
  count(distinct si.id) as total_inboxes,
  count(distinct si.id) filter (where si.connected = true) as connected_inboxes,
  count(distinct sd.id) as total_domains,
  sum(il.daily_cap) as total_daily_capacity,
  count(distinct fma.id) filter (where fma.created_at >= now() - interval '24 hours') as recent_activities
from public.brands b
left join public.sender_domains sd on sd.brand_id = b.id
left join public.sender_inboxes si on si.brand_id = b.id
left join public.inbox_limits il on il.inbox_id = si.id
left join public.fleet_manager_activity fma on fma.brand_id = b.id
group by b.id, b.name, b.workspace_id;

-- Brand Sequences Summary View
create or replace view public.v_brand_sequences_summary as
select 
  b.id as brand_id,
  b.name as brand_name,
  b.workspace_id,
  count(distinct s.id) as total_sequences,
  count(distinct ss.id) as total_steps,
  count(distinct ss.id) filter (where s.stop_on_reply = true) as sequences_with_stop_on_reply
from public.brands b
left join public.sequences s on s.brand_id = b.id
left join public.sequence_steps ss on ss.brand_id = b.id
group by b.id, b.name, b.workspace_id;

-- ============================================================================
-- 7️⃣ HELPER FUNCTIONS FOR BRAND MANAGEMENT
-- ============================================================================

-- Function: Get brand identity for email sending
create or replace function public.get_brand_identity(p_brand_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_brand record;
begin
  select 
    name,
    color_primary,
    color_secondary,
    logo_url,
    from_name,
    default_signature
  into v_brand
  from public.brands
  where id = p_brand_id;
  
  if not found then
    return null;
  end if;
  
  return jsonb_build_object(
    'name', v_brand.name,
    'color_primary', v_brand.color_primary,
    'color_secondary', v_brand.color_secondary,
    'logo_url', v_brand.logo_url,
    'from_name', v_brand.from_name,
    'default_signature', v_brand.default_signature
  );
end;
$$;

-- Function: Get brand stats
create or replace function public.get_brand_stats(p_brand_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_stats jsonb;
begin
  select jsonb_build_object(
    'brand_id', b.id,
    'brand_name', b.name,
    'domains_count', count(distinct sd.id),
    'inboxes_count', count(distinct si.id),
    'sequences_count', count(distinct s.id),
    'campaigns_count', count(distinct c.id),
    'revenue_closed', coalesce(sum(d.value) filter (where d.status = 'won'), 0),
    'meetings_booked', count(distinct m.id)
  ) into v_stats
  from public.brands b
  left join public.sender_domains sd on sd.brand_id = b.id
  left join public.sender_inboxes si on si.brand_id = b.id
  left join public.sequences s on s.brand_id = b.id
  left join public.campaigns c on c.brand_id = b.id
  left join public.deals d on d.brand_id = b.id
  left join public.meetings m on m.brand_id = b.id
  where b.id = p_brand_id
  group by b.id, b.name;
  
  return v_stats;
end;
$$;

-- Function: List all brands for a workspace
create or replace function public.list_workspace_brands(p_workspace_id uuid)
returns table (
  id uuid,
  name text,
  color_primary text,
  color_secondary text,
  logo_url text,
  from_name text,
  created_at timestamptz,
  stats jsonb
)
language plpgsql
stable
security definer
as $$
begin
  return query
  select 
    b.id,
    b.name,
    b.color_primary,
    b.color_secondary,
    b.logo_url,
    b.from_name,
    b.created_at,
    public.get_brand_stats(b.id) as stats
  from public.brands b
  where b.workspace_id = p_workspace_id
  order by b.created_at desc;
end;
$$;

-- ============================================================================
-- 8️⃣ GRANT PERMISSIONS
-- ============================================================================

grant select, insert, update, delete on public.brands to authenticated;
grant select on public.v_brand_revenue_summary to authenticated;
grant select on public.v_brand_deliverability_summary to authenticated;
grant select on public.v_brand_fleet_summary to authenticated;
grant select on public.v_brand_sequences_summary to authenticated;
grant execute on function public.get_brand_identity(uuid) to authenticated;
grant execute on function public.get_brand_stats(uuid) to authenticated;
grant execute on function public.list_workspace_brands(uuid) to authenticated;

-- ============================================================================
-- 9️⃣ COMMENTS
-- ============================================================================

comment on table public.brands is 'Brand identities within a workspace. Each brand has its own domains, inboxes, sequences, and brand identity settings.';
comment on column public.brands.name is 'Brand name (e.g., "Construction Leads Co", "HVAC Systems Co")';
comment on column public.brands.color_primary is 'Primary brand color (hex code)';
comment on column public.brands.color_secondary is 'Secondary brand color (hex code)';
comment on column public.brands.logo_url is 'URL to brand logo';
comment on column public.brands.from_name is 'Default "From name" for emails sent from this brand';
comment on column public.brands.default_signature is 'Default email signature for this brand';

comment on view public.v_brand_revenue_summary is 'Revenue summary per brand (meetings, deals, revenue)';
comment on view public.v_brand_deliverability_summary is 'Deliverability metrics per brand (domains, inboxes, health scores)';
comment on view public.v_brand_fleet_summary is 'Fleet management summary per brand (inboxes, domains, capacity)';
comment on view public.v_brand_sequences_summary is 'Sequences summary per brand (total sequences, steps)';

-- ============================================================================
-- 🔟 BLOCK 466 COMPLETE ✅
-- ============================================================================



