-- Block 169: Team Sharing - RLS Policies
-- Applies team-based RLS to all account-scoped tables

-- Ensure campaigns has account_id (if not already present)
-- Note: This assumes campaigns might have user_id or workspace_id that maps to account_id
-- Adjust based on your actual schema
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'account_id'
  ) then
    -- Add account_id column
    alter table public.campaigns add column account_id uuid;
    
    -- Try to backfill from user_id if it exists
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'campaigns' 
      and column_name = 'user_id'
    ) then
      update public.campaigns set account_id = user_id where account_id is null;
    end if;
    
    -- Make it not null after backfill
    alter table public.campaigns alter column account_id set not null;
  end if;
end $$;

create index if not exists idx_campaigns_account on public.campaigns(account_id);

-- Helper function to check if user is team member with read access
create or replace function public.is_team_member(p_account_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.account_id = p_account_id
    and tm.user_id = auth.uid()
  );
$$;

-- Helper function to check if user can modify (owner/admin/member)
create or replace function public.can_modify_team_resource(p_account_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.account_id = p_account_id
    and tm.user_id = auth.uid()
    and tm.role in ('owner','admin','member')
  );
$$;

-- Helper function to get account_id from campaign
create or replace function public.get_campaign_account_id(p_campaign_id uuid)
returns uuid
language sql
stable
security definer
as $$
  select account_id from public.campaigns where id = p_campaign_id;
$$;

-- Helper function to get account_id from lead
create or replace function public.get_lead_account_id(p_lead_id uuid)
returns uuid
language sql
stable
security definer
as $$
  select account_id from public.leads where id = p_lead_id;
$$;

-- ============================================================================
-- CAMPAIGNS
-- ============================================================================
alter table public.campaigns enable row level security;

drop policy if exists "teams can read their campaigns" on public.campaigns;
create policy "teams can read their campaigns"
on public.campaigns
for select
using (public.is_team_member(account_id));

drop policy if exists "teams can modify based on role" on public.campaigns;
create policy "teams can modify based on role"
on public.campaigns
for all
using (public.can_modify_team_resource(account_id))
with check (public.can_modify_team_resource(account_id));

-- ============================================================================
-- SEGMENTS
-- ============================================================================
alter table public.segments enable row level security;

drop policy if exists "teams can read their segments" on public.segments;
create policy "teams can read their segments"
on public.segments
for select
using (public.is_team_member(account_id));

drop policy if exists "teams can modify segments based on role" on public.segments;
create policy "teams can modify segments based on role"
on public.segments
for all
using (public.can_modify_team_resource(account_id))
with check (public.can_modify_team_resource(account_id));

-- ============================================================================
-- LEADS
-- ============================================================================
alter table public.leads enable row level security;

drop policy if exists "teams can read their leads" on public.leads;
create policy "teams can read their leads"
on public.leads
for select
using (public.is_team_member(account_id));

drop policy if exists "teams can modify leads based on role" on public.leads;
create policy "teams can modify leads based on role"
on public.leads
for all
using (public.can_modify_team_resource(account_id))
with check (public.can_modify_team_resource(account_id));

-- ============================================================================
-- SEND_QUEUE (links through campaigns)
-- ============================================================================
alter table public.send_queue enable row level security;

drop policy if exists "teams can read their send_queue" on public.send_queue;
create policy "teams can read their send_queue"
on public.send_queue
for select
using (
  exists (
    select 1
    from public.campaigns c
    where c.id = send_queue.campaign_id
    and public.is_team_member(c.account_id)
  )
);

drop policy if exists "teams can modify send_queue based on role" on public.send_queue;
create policy "teams can modify send_queue based on role"
on public.send_queue
for all
using (
  exists (
    select 1
    from public.campaigns c
    where c.id = send_queue.campaign_id
    and public.can_modify_team_resource(c.account_id)
  )
)
with check (
  exists (
    select 1
    from public.campaigns c
    where c.id = send_queue.campaign_id
    and public.can_modify_team_resource(c.account_id)
  )
);

-- ============================================================================
-- FOLLOWUP_RULES (links through campaigns)
-- ============================================================================
alter table public.followup_rules enable row level security;

drop policy if exists "teams can read their followup_rules" on public.followup_rules;
create policy "teams can read their followup_rules"
on public.followup_rules
for select
using (
  exists (
    select 1
    from public.campaigns c
    where c.id = followup_rules.campaign_id
    and public.is_team_member(c.account_id)
  )
);

drop policy if exists "teams can modify followup_rules based on role" on public.followup_rules;
create policy "teams can modify followup_rules based on role"
on public.followup_rules
for all
using (
  exists (
    select 1
    from public.campaigns c
    where c.id = followup_rules.campaign_id
    and public.can_modify_team_resource(c.account_id)
  )
)
with check (
  exists (
    select 1
    from public.campaigns c
    where c.id = followup_rules.campaign_id
    and public.can_modify_team_resource(c.account_id)
  )
);

-- ============================================================================
-- EMAIL_EVENTS (links through campaigns)
-- ============================================================================
alter table public.email_events enable row level security;

drop policy if exists "teams can read their email_events" on public.email_events;
create policy "teams can read their email_events"
on public.email_events
for select
using (
  exists (
    select 1
    from public.campaigns c
    where c.id = email_events.campaign_id
    and public.is_team_member(c.account_id)
  )
);

-- Service role can insert events
drop policy if exists "service_role_can_insert_email_events" on public.email_events;
create policy "service_role_can_insert_email_events"
on public.email_events
for insert
to service_role
with check (true);

-- ============================================================================
-- EMAIL_BOUNCES (links through campaigns)
-- ============================================================================
alter table public.email_bounces enable row level security;

drop policy if exists "teams can read their email_bounces" on public.email_bounces;
create policy "teams can read their email_bounces"
on public.email_bounces
for select
using (
  exists (
    select 1
    from public.campaigns c
    where c.id = email_bounces.campaign_id
    and public.is_team_member(c.account_id)
  )
);

-- Service role can insert bounces
drop policy if exists "service_role_can_insert_email_bounces" on public.email_bounces;
create policy "service_role_can_insert_email_bounces"
on public.email_bounces
for insert
to service_role
with check (true);

-- ============================================================================
-- EMAIL_REPLIES (has account_id directly)
-- ============================================================================
alter table public.email_replies enable row level security;

drop policy if exists "teams can read their email_replies" on public.email_replies;
create policy "teams can read their email_replies"
on public.email_replies
for select
using (
  account_id is not null
  and public.is_team_member(account_id)
);

-- Service role can insert replies
drop policy if exists "service_role_can_insert_email_replies" on public.email_replies;
create policy "service_role_can_insert_email_replies"
on public.email_replies
for insert
to service_role
with check (true);

-- ============================================================================
-- UNSUBSCRIBES (links through campaigns)
-- ============================================================================
alter table public.unsubscribes enable row level security;

drop policy if exists "teams can read their unsubscribes" on public.unsubscribes;
create policy "teams can read their unsubscribes"
on public.unsubscribes
for select
using (
  campaign_id is null
  or exists (
    select 1
    from public.campaigns c
    where c.id = unsubscribes.campaign_id
    and public.is_team_member(c.account_id)
  )
  or exists (
    select 1
    from public.leads l
    where l.id = unsubscribes.lead_id
    and public.is_team_member(l.account_id)
  )
);

-- Service role can insert unsubscribes
drop policy if exists "service_role_can_insert_unsubscribes" on public.unsubscribes;
create policy "service_role_can_insert_unsubscribes"
on public.unsubscribes
for insert
to service_role
with check (true);

-- ============================================================================
-- LEAD_NOTES (has account_id directly)
-- ============================================================================
alter table public.lead_notes enable row level security;

drop policy if exists "teams can read their lead_notes" on public.lead_notes;
create policy "teams can read their lead_notes"
on public.lead_notes
for select
using (public.is_team_member(account_id));

drop policy if exists "teams can modify lead_notes based on role" on public.lead_notes;
create policy "teams can modify lead_notes based on role"
on public.lead_notes
for all
using (public.can_modify_team_resource(account_id))
with check (public.can_modify_team_resource(account_id));












