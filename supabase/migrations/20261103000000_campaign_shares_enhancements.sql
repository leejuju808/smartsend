-- Campaign Shares Enhancements
-- 1. Add user_id_by_email function for secure email lookup
-- 2. Update user_campaign_role to accept p_user parameter
-- 3. Add RLS policies to child tables (leads, sequences, sequence_steps, templates, send_queue, send_logs)

-- ============================================
-- PART 1: Secure email -> user_id lookup
-- ============================================

-- Map email -> user_id securely (security definer to access auth.users)
create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
stable
as $$
  select id
  from auth.users
  where lower(email) = lower(p_email)
  limit 1
$$;

revoke all on function public.user_id_by_email(text) from public;
grant execute on function public.user_id_by_email(text) to authenticated;

-- ============================================
-- PART 2: Update user_campaign_role to accept p_user parameter
-- ============================================

-- Update function to accept optional user parameter (for role endpoint)
create or replace function public.user_campaign_role(
  p_campaign uuid,
  p_user uuid default auth.uid()
)
returns text
language sql stable as $$
  with mine as (
    select 'owner'::text as role
    from public.campaigns c
    where c.id = p_campaign and c.user_id = p_user
  ), shared as (
    select s.role from public.campaign_shares s
    where s.campaign_id = p_campaign and s.user_id = p_user
  )
  select coalesce( (select role from mine),
               (select role from shared),
               null);
$$;

-- ============================================
-- PART 3: RLS on child tables (read/write follow parent)
-- ============================================

-- Enable RLS on child tables
alter table if exists public.leads enable row level security;
alter table if exists public.sequences enable row level security;
alter table if exists public.sequence_steps enable row level security;
alter table if exists public.templates enable row level security;
alter table if exists public.email_templates enable row level security;
alter table if exists public.send_queue enable row level security;
alter table if exists public.send_logs enable row level security;
alter table if exists public.campaign_leads enable row level security;

-- ============================================
-- LEADS: READ if you can view the parent campaign
-- ============================================
do $$
begin
  -- Drop existing policies if they exist
  drop policy if exists "leads.select.view" on public.leads;
  drop policy if exists "leads.write.edit" on public.leads;
  drop policy if exists "leads.update.edit" on public.leads;
  drop policy if exists "leads.delete.edit" on public.leads;
  
  -- Only apply if table exists and has campaign_id column
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'leads' and column_name = 'campaign_id'
  ) then
    -- READ if you can view the parent campaign
    create policy "leads.select.view" on public.leads
      for select using (
        campaign_id is null or public.can_view_campaign(campaign_id)
      );
    
    -- INSERT/UPDATE/DELETE only if you can edit
    create policy "leads.write.edit" on public.leads
      for insert with check (
        campaign_id is null or public.can_edit_campaign(campaign_id)
      );
    
    create policy "leads.update.edit" on public.leads
      for update using (
        campaign_id is null or public.can_edit_campaign(campaign_id)
      ) with check (
        campaign_id is null or public.can_edit_campaign(campaign_id)
      );
    
    create policy "leads.delete.edit" on public.leads
      for delete using (
        campaign_id is null or public.can_edit_campaign(campaign_id)
      );
  end if;
end $$;

-- ============================================
-- CAMPAIGN_LEADS: READ/WRITE based on campaign access
-- ============================================
do $$
begin
  drop policy if exists "campaign_leads.select.view" on public.campaign_leads;
  drop policy if exists "campaign_leads.write.edit" on public.campaign_leads;
  drop policy if exists "campaign_leads.update.edit" on public.campaign_leads;
  drop policy if exists "campaign_leads.delete.edit" on public.campaign_leads;
  
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'campaign_leads'
  ) then
    create policy "campaign_leads.select.view" on public.campaign_leads
      for select using (public.can_view_campaign(campaign_id));
    
    create policy "campaign_leads.write.edit" on public.campaign_leads
      for insert with check (public.can_edit_campaign(campaign_id));
    
    create policy "campaign_leads.update.edit" on public.campaign_leads
      for update using (public.can_edit_campaign(campaign_id))
      with check (public.can_edit_campaign(campaign_id));
    
    create policy "campaign_leads.delete.edit" on public.campaign_leads
      for delete using (public.can_edit_campaign(campaign_id));
  end if;
end $$;

-- ============================================
-- SEQUENCES: READ/WRITE based on campaign access
-- ============================================
do $$
begin
  drop policy if exists "sequences.select.view" on public.sequences;
  drop policy if exists "sequences.write.edit" on public.sequences;
  drop policy if exists "sequences.update.edit" on public.sequences;
  drop policy if exists "sequences.delete.edit" on public.sequences;
  
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'sequences' and column_name = 'campaign_id'
  ) then
    create policy "sequences.select.view" on public.sequences
      for select using (public.can_view_campaign(campaign_id));
    
    create policy "sequences.write.edit" on public.sequences
      for insert with check (public.can_edit_campaign(campaign_id));
    
    create policy "sequences.update.edit" on public.sequences
      for update using (public.can_edit_campaign(campaign_id))
      with check (public.can_edit_campaign(campaign_id));
    
    create policy "sequences.delete.edit" on public.sequences
      for delete using (public.can_edit_campaign(campaign_id));
  end if;
end $$;

-- ============================================
-- SEQUENCE_STEPS: READ/WRITE via parent sequence's campaign
-- ============================================
do $$
begin
  drop policy if exists "steps.select.view" on public.sequence_steps;
  drop policy if exists "steps.write.edit" on public.sequence_steps;
  drop policy if exists "steps.update.edit" on public.sequence_steps;
  drop policy if exists "steps.delete.edit" on public.sequence_steps;
  
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'sequence_steps'
  ) then
    -- Access via the sequence's campaign_id
    create policy "steps.select.view" on public.sequence_steps
      for select using (
        exists (
          select 1 from public.sequences s
          where s.id = sequence_steps.sequence_id
            and public.can_view_campaign(s.campaign_id)
        )
      );
    
    create policy "steps.write.edit" on public.sequence_steps
      for insert with check (
        exists (
          select 1 from public.sequences s
          where s.id = sequence_steps.sequence_id
            and public.can_edit_campaign(s.campaign_id)
        )
      );
    
    create policy "steps.update.edit" on public.sequence_steps
      for update using (
        exists (
          select 1 from public.sequences s
          where s.id = sequence_steps.sequence_id
            and public.can_edit_campaign(s.campaign_id)
        )
      ) with check (
        exists (
          select 1 from public.sequences s
          where s.id = sequence_steps.sequence_id
            and public.can_edit_campaign(s.campaign_id)
        )
      );
    
    create policy "steps.delete.edit" on public.sequence_steps
      for delete using (
        exists (
          select 1 from public.sequences s
          where s.id = sequence_steps.sequence_id
            and public.can_edit_campaign(s.campaign_id)
        )
      );
  end if;
end $$;

-- ============================================
-- TEMPLATES: READ/WRITE if table has campaign_id
-- ============================================
do $$
begin
  drop policy if exists "templates.select.view" on public.templates;
  drop policy if exists "templates.write.edit" on public.templates;
  drop policy if exists "templates.update.edit" on public.templates;
  drop policy if exists "templates.delete.edit" on public.templates;
  
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'templates' and column_name = 'campaign_id'
  ) then
    create policy "templates.select.view" on public.templates
      for select using (
        campaign_id is null or public.can_view_campaign(campaign_id)
      );
    
    create policy "templates.write.edit" on public.templates
      for insert with check (
        campaign_id is null or public.can_edit_campaign(campaign_id)
      );
    
    create policy "templates.update.edit" on public.templates
      for update using (
        campaign_id is null or public.can_edit_campaign(campaign_id)
      ) with check (
        campaign_id is null or public.can_edit_campaign(campaign_id)
      );
    
    create policy "templates.delete.edit" on public.templates
      for delete using (
        campaign_id is null or public.can_edit_campaign(campaign_id)
      );
  end if;
end $$;

-- ============================================
-- EMAIL_TEMPLATES: READ/WRITE if table has campaign_id
-- ============================================
do $$
begin
  drop policy if exists "email_templates.select.view" on public.email_templates;
  drop policy if exists "email_templates.write.edit" on public.email_templates;
  drop policy if exists "email_templates.update.edit" on public.email_templates;
  drop policy if exists "email_templates.delete.edit" on public.email_templates;
  
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'email_templates' and column_name = 'campaign_id'
  ) then
    create policy "email_templates.select.view" on public.email_templates
      for select using (
        campaign_id is null or public.can_view_campaign(campaign_id)
      );
    
    create policy "email_templates.write.edit" on public.email_templates
      for insert with check (
        campaign_id is null or public.can_edit_campaign(campaign_id)
      );
    
    create policy "email_templates.update.edit" on public.email_templates
      for update using (
        campaign_id is null or public.can_edit_campaign(campaign_id)
      ) with check (
        campaign_id is null or public.can_edit_campaign(campaign_id)
      );
    
    create policy "email_templates.delete.edit" on public.email_templates
      for delete using (
        campaign_id is null or public.can_edit_campaign(campaign_id)
      );
  end if;
end $$;

-- ============================================
-- SEND_QUEUE: READ for viewers, system-managed writes
-- ============================================
do $$
begin
  drop policy if exists "queue.select.view" on public.send_queue;
  drop policy if exists "queue.write.edit" on public.send_queue;
  drop policy if exists "queue.update.edit" on public.send_queue;
  
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'send_queue'
  ) then
    -- READ if you can view the parent campaign
    create policy "queue.select.view" on public.send_queue
      for select using (public.can_view_campaign(campaign_id));
    
    -- Block client writes (keep only SELECT for authenticated users)
    -- System writes via service_role only
    revoke all on table public.send_queue from anon, authenticated;
    grant select on table public.send_queue to authenticated;
  end if;
end $$;

-- ============================================
-- SEND_LOGS: READ for viewers, system-managed writes
-- ============================================
do $$
begin
  drop policy if exists "logs.select.view" on public.send_logs;
  
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'send_logs'
  ) then
    -- READ if you can view the parent campaign
    create policy "logs.select.view" on public.send_logs
      for select using (public.can_view_campaign(campaign_id));
    
    -- Block client writes (keep only SELECT for authenticated users)
    -- System writes via service_role only
    revoke all on table public.send_logs from anon, authenticated;
    grant select on table public.send_logs to authenticated;
  end if;
end $$;

