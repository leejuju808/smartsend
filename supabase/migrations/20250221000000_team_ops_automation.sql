-- Team Ops Automation - Support Tickets
-- Migration for support ticket triage and ops automation

-- ============================================================================
-- 1. SUPPORT TICKETS TABLE
-- ============================================================================

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.workspaces(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  subject text not null,
  message text not null,
  status text default 'open' check (status in ('open', 'triaged', 'in_progress', 'resolved', 'closed')),
  priority text default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  ai_summary text,
  next_action text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_support_tickets_status on support_tickets(status);
create index if not exists idx_support_tickets_priority on support_tickets(priority);
create index if not exists idx_support_tickets_org_id on support_tickets(org_id);
create index if not exists idx_support_tickets_user_id on support_tickets(user_id);
create index if not exists idx_support_tickets_created_at on support_tickets(created_at desc);

-- Updated_at trigger
create or replace function update_support_tickets_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_support_tickets_updated_at
before update on support_tickets
for each row
execute function update_support_tickets_updated_at();

-- RLS policies
alter table support_tickets enable row level security;

-- Users can view tickets for their org or tickets they created
create policy "Users can view tickets for their workspace"
on support_tickets
for select
using (
  org_id in (
    select workspace_id from workspace_members 
    where user_id = auth.uid()
  )
  or user_id = auth.uid()
);

-- Users can create tickets
create policy "Users can create tickets"
on support_tickets
for insert
with check (user_id = auth.uid());

-- Service role can manage all tickets
create policy "Service role can manage all tickets"
on support_tickets
for all
to service_role
using (true)
with check (true);

grant select, insert, update on support_tickets to authenticated;
grant all on support_tickets to service_role;

-- ============================================================================
-- 2. CUSTOMER SUCCESS TEMPLATE (Add to ai_templates)
-- ============================================================================

-- Insert customer success check-in template if it doesn't exist
insert into ai_templates (org_id, name, body, subject, template_type)
values (
  null, -- global template
  'Customer Success Check-In',
  'Hey {{first_name}}, how''s your team using AUREV this week? Anything we can automate for you?',
  'Quick check-in — how''s AUREV working for you?',
  'winback' -- reuse winback type or we could add 'customer_success' type
)
on conflict do nothing;

-- Add 'customer_success' as valid template_type if needed
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'ai_templates_template_type_check'
    and contype = 'c'
  ) then
    alter table ai_templates 
    drop constraint if exists ai_templates_template_type_check;
    
    alter table ai_templates 
    add constraint ai_templates_template_type_check 
    check (template_type in ('winback', 'activation', 'renewal', 'customer_success'));
  end if;
end $$;

-- Update the template to use customer_success type (if constraint allows)
-- First, try to update the constraint if needed
do $$
begin
  -- Drop old constraint if exists
  alter table ai_templates drop constraint if exists ai_templates_template_type_check;
  
  -- Add new constraint with customer_success
  alter table ai_templates 
  add constraint ai_templates_template_type_check 
  check (template_type in ('winback', 'activation', 'renewal', 'customer_success'));
end $$;

-- Update the template to use customer_success type
update ai_templates 
set template_type = 'customer_success'
where name = 'Customer Success Check-In';

-- ============================================================================
-- 3. INACTIVE USERS VIEW (for customer success - 14 days inactive)
-- ============================================================================

-- Create view for 14-day inactive users (enterprise focus)
create or replace view inactive_users_14d as
select
  p.id as user_id,
  p.email,
  p.full_name,
  w.id as workspace_id,
  w.name as workspace_name,
  max(c.sent_at) as last_activity,
  extract(epoch from (
    case 
      when max(c.sent_at) is null then now() - p.created_at
      else now() - max(c.sent_at)
    end
  )) / 86400.0 as days_inactive,
  p.created_at as signup_date,
  s.plan_id as plan
from profiles p
left join workspaces w on w.owner_id = p.id
left join subscriptions s on s.workspace_id = w.id and s.status = 'active'
left join channel_messages c 
  on c.org_id = w.id 
  and c.direction = 'outbound'
  and c.status in ('sent', 'delivered')
group by p.id, p.email, p.full_name, p.created_at, w.id, w.name, s.plan_id
having (
  case 
    when max(c.sent_at) is null then now() - p.created_at
    else now() - max(c.sent_at)
  end
) > interval '14 days'
and s.plan_id in ('pro', 'enterprise');

grant select on inactive_users_14d to authenticated;
grant select on inactive_users_14d to service_role;

