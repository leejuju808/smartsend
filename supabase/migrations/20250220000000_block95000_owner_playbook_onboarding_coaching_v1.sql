-- =========================================================
-- Block 95000 — SmartSend Roofing Owner Playbook + Guided Onboarding + In-App Coaching System v1
-- "THE WEAPONIZED ONBOARDING SYSTEM THAT MAKES ROOFERS FEEL STUPID FOR NOT USING SMARTSEND"
-- =========================================================

-- ============================================================================
-- 1. OWNER PLAYBOOK TABLES (IN-APP DOCUMENTATION ENGINE)
-- ============================================================================

-- Playbook sections (e.g., "The SmartSend Method", "Setup Checklist", "Closing Leads")
create table if not exists public.owner_playbook_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  order_index int not null,
  created_at timestamptz default now()
);

-- Playbook steps (individual content items within sections)
create table if not exists public.owner_playbook_steps (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.owner_playbook_sections(id) on delete cascade,
  title text not null,
  content text not null,
  order_index int not null,
  created_at timestamptz default now()
);

-- Indexes for playbook tables
create index if not exists idx_playbook_sections_order on public.owner_playbook_sections(order_index);
create index if not exists idx_playbook_steps_section on public.owner_playbook_steps(section_id);
create index if not exists idx_playbook_steps_order on public.owner_playbook_steps(section_id, order_index);

-- ============================================================================
-- 2. GUIDED ONBOARDING FLOW TABLES (THE "DO THIS NOW" WIZARD)
-- ============================================================================

-- Onboarding tasks (the checklist items)
create table if not exists public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  title text not null,
  description text,
  order_index int not null,
  created_at timestamptz default now()
);

-- User onboarding progress (tracks which tasks each user has completed)
create table if not exists public.user_onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.onboarding_tasks(id) on delete cascade,
  completed boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, task_id)
);

-- Indexes for onboarding tables
create index if not exists idx_onboarding_tasks_order on public.onboarding_tasks(order_index);
create index if not exists idx_user_onboarding_progress_user on public.user_onboarding_progress(user_id);
create index if not exists idx_user_onboarding_progress_task on public.user_onboarding_progress(task_id);
create index if not exists idx_user_onboarding_progress_completed on public.user_onboarding_progress(user_id, completed);

-- ============================================================================
-- 3. IN-APP COACHING SYSTEM TABLES (AI TUTOR + ACTION PROMPTS)
-- ============================================================================

-- Coaching prompts (the AI messages that guide users)
create table if not exists public.coaching_prompts (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null, -- 'onboarding_step', 'weekly_summary', 'no_activity', 'no_replies', 'hot_leads', etc.
  title text not null,
  message text not null,
  action_button text,
  action_url text,
  created_at timestamptz default now()
);

-- Index for coaching prompts
create index if not exists idx_coaching_prompts_trigger on public.coaching_prompts(trigger_type);

-- ============================================================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================================================

alter table public.owner_playbook_sections enable row level security;
alter table public.owner_playbook_steps enable row level security;
alter table public.onboarding_tasks enable row level security;
alter table public.user_onboarding_progress enable row level security;
alter table public.coaching_prompts enable row level security;

-- RLS Policies: Playbook sections (public read)
create policy "Anyone can read playbook sections"
  on public.owner_playbook_sections
  for select
  using (true);

-- RLS Policies: Playbook steps (public read)
create policy "Anyone can read playbook steps"
  on public.owner_playbook_steps
  for select
  using (true);

-- RLS Policies: Onboarding tasks (public read)
create policy "Anyone can read onboarding tasks"
  on public.onboarding_tasks
  for select
  using (true);

-- RLS Policies: User onboarding progress (users can only see their own)
create policy "Users can view own onboarding progress"
  on public.user_onboarding_progress
  for select
  using (auth.uid() = user_id);

create policy "Users can manage own onboarding progress"
  on public.user_onboarding_progress
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS Policies: Coaching prompts (public read)
create policy "Anyone can read coaching prompts"
  on public.coaching_prompts
  for select
  using (true);

-- ============================================================================
-- 5. SEED DATA: OWNER PLAYBOOK CONTENT
-- ============================================================================

-- Section 1: The SmartSend Method
insert into public.owner_playbook_sections (title, slug, order_index)
values ('The SmartSend Method', 'the-smartsend-method', 1)
on conflict (slug) do nothing;

-- Get section ID for Section 1
do $$
declare
  section1_id uuid;
begin
  select id into section1_id from public.owner_playbook_sections where slug = 'the-smartsend-method';
  
  -- Steps for Section 1
  insert into public.owner_playbook_steps (section_id, title, content, order_index)
  values
    (section1_id, 'What SmartSend Is', 
     'SmartSend is your AI-powered cold email system built specifically for roofing companies. Instead of manually sending emails one-by-one or using generic tools like Mailchimp, SmartSend automates your entire outreach process. It sends personalized emails to homeowners, tracks replies, and books you jobs—all on autopilot.

Think of it like having a full-time sales rep who never sleeps, never forgets to follow up, and never gets tired of sending emails.', 1),
    
    (section1_id, 'Why Cold Email Works for Roofers', 
     'Here''s the truth: Most roofers are still using door hangers, yard signs, and word-of-mouth. That means your competition isn''t doing cold email. You have a massive advantage.

Cold email works for roofers because:
• Homeowners need roofers (storms, leaks, age)
• They''re not actively searching (they don''t know they need you yet)
• You can reach them at scale (hundreds of homeowners per day)
• It''s personal (not spam—real, helpful emails)

SmartSend makes cold email work by sending emails that actually get opened, read, and replied to. We use AI to personalize every message so it feels like you wrote it yourself.', 2),
    
    (section1_id, 'How SmartSend Books You Jobs on Autopilot', 
     'SmartSend doesn''t just send emails—it books you jobs. Here''s how:

1. **You import leads** (homeowners in your service area)
2. **SmartSend sends personalized emails** (AI writes each one)
3. **Homeowners reply** (because the emails are helpful, not spammy)
4. **You get notified** (hot leads land in your inbox)
5. **You close the job** (estimate, close, get paid)

The system handles everything: sending, tracking, follow-ups, reply detection. You just show up to close deals.

Most roofers see their first reply within 48 hours of launching their first campaign.', 3)
  on conflict do nothing;
end $$;

-- Section 2: Setup Checklist
insert into public.owner_playbook_sections (title, slug, order_index)
values ('Setup Checklist', 'setup-checklist', 2)
on conflict (slug) do nothing;

do $$
declare
  section2_id uuid;
begin
  select id into section2_id from public.owner_playbook_sections where slug = 'setup-checklist';
  
  insert into public.owner_playbook_steps (section_id, title, content, order_index)
  values
    (section2_id, 'Connect Your Domain', 
     'Your domain is your sending identity. Connect it so emails come from your company (e.g., john@yourroofingcompany.com instead of a generic Gmail address).

This takes 5 minutes:
1. Go to Settings → Mailbox
2. Click "Connect Domain"
3. Add the DNS records we give you
4. Wait 5 minutes for verification

Once connected, your emails look professional and get delivered better.', 1),
    
    (section2_id, 'Add Your Sending Inbox', 
     'Your sending inbox is the email address that sends campaigns. This should be a real inbox you can access (like your Gmail or Outlook).

To add it:
1. Go to Settings → Mailbox
2. Click "Add Inbox"
3. Connect via OAuth (Gmail/Outlook) or add SMTP credentials
4. Verify it works

You can add multiple inboxes to send more emails per day.', 2),
    
    (section2_id, 'Choose One Template', 
     'Don''t overthink this. Pick ONE template that matches your style and start sending.

SmartSend comes with roofing-specific templates:
• Storm damage follow-up
• Neighborhood introduction
• Insurance claim assistance
• Maintenance reminder

Pick the one that fits your business. You can always create custom templates later.', 3),
    
    (section2_id, 'Start Sending at Low Volume', 
     'Start small. Send 25-50 emails per day for the first week. This "warms up" your inbox and builds trust with email providers.

After a week, you can increase to 100-200 per day. SmartSend will guide you on when to scale up.

The goal: Get your first reply, not send 10,000 emails on day one.', 4)
  on conflict do nothing;
end $$;

-- Section 3: Closing Leads
insert into public.owner_playbook_sections (title, slug, order_index)
values ('Closing Leads', 'closing-leads', 3)
on conflict (slug) do nothing;

do $$
declare
  section3_id uuid;
begin
  select id into section3_id from public.owner_playbook_sections where slug = 'closing-leads';
  
  insert into public.owner_playbook_steps (section_id, title, content, order_index)
  values
    (section3_id, 'How to Respond to Hot Leads', 
     'When a homeowner replies to your email, they''re HOT. They need a roofer. Here''s how to respond:

1. **Reply within 1 hour** (the faster you respond, the more likely you close)
2. **Be helpful, not salesy** (answer their question, offer to help)
3. **Book an inspection** (suggest a time to come out)
4. **Follow up if they don''t reply** (SmartSend can auto-follow-up for you)

Pro tip: Set up email notifications so you know immediately when someone replies.', 1),
    
    (section3_id, 'How to Estimate Fast', 
     'Speed wins. The faster you get an estimate out, the more likely you close the job.

SmartSend helps you estimate fast by:
• Tracking all your leads in one place
• Showing you which leads are hot (replied to emails)
• Reminding you to follow up

Your process:
1. Get the reply notification
2. Call or text to schedule inspection
3. Do the inspection
4. Send estimate within 24 hours
5. Follow up until they say yes or no

The average roofer takes 3-5 days to send an estimate. You can do it in 24 hours and win more jobs.', 2),
    
    (section3_id, 'How to Track Job Value', 
     'Track every lead from email → reply → estimate → close. This tells you:
• Which emails work best
• Which neighborhoods convert
• Your close rate
• Your average job value

In SmartSend, you can:
• Mark leads as "Won" or "Lost"
• Add job value when you close
• See your revenue from email campaigns

This data helps you double down on what works and stop doing what doesn''t.', 3)
  on conflict do nothing;
end $$;

-- ============================================================================
-- 6. SEED DATA: ONBOARDING TASKS
-- ============================================================================

insert into public.onboarding_tasks (key, title, description, order_index)
values
  ('add_company_name_logo', 'Add Your Company Name + Logo', 'Set up your company branding so emails look professional.', 1),
  ('connect_sending_inbox', 'Connect Your Sending Inbox', 'Add the email address that will send your campaigns (Gmail, Outlook, or SMTP).', 2),
  ('pick_campaign_template', 'Pick Your Roofing Campaign Template', 'Choose one template to start with. You can create custom ones later.', 3),
  ('personalize_openers', 'Personalize Your Openers', 'Add your name and customize the email opening to match your voice.', 4),
  ('set_sending_schedule', 'Set Your Sending Schedule', 'Choose when emails send (e.g., weekdays 9am-5pm).', 5),
  ('launch_first_25_emails', 'Launch Your First 25 Emails', 'Import leads and send your first small batch to warm up your inbox.', 6),
  ('review_replies', 'Review Your Replies', 'Check your inbox for replies and learn how to respond to hot leads.', 7)
on conflict (key) do nothing;

-- ============================================================================
-- 7. SEED DATA: COACHING PROMPTS
-- ============================================================================

insert into public.coaching_prompts (trigger_type, title, message, action_button, action_url)
values
  ('onboarding_step', 'Complete Your Setup', 'Finish setting up SmartSend to start booking jobs. You''re just a few steps away.', 'Continue Setup', '/onboarding'),
  ('no_activity', 'Keep Your Pipeline Full', 'Send 25 more emails today to stay ahead of your local competitors. Consistency wins.', 'Send Emails', '/campaigns'),
  ('no_replies', 'Improve Your Personalization', 'Try personalizing your email openers with local references. This increases reply rates by 3x.', 'Edit Template', '/campaigns'),
  ('hot_leads', 'Follow Up on Hot Leads', 'You have leads who replied. Respond within 1 hour to maximize your close rate.', 'View Replies', '/inbox'),
  ('weekly_summary', 'Review Your Week', 'See how many jobs you booked this week from SmartSend campaigns.', 'View Analytics', '/dashboard/analytics')
on conflict do nothing;

-- ============================================================================
-- 8. HELPER FUNCTION: Get Next Onboarding Task
-- ============================================================================

create or replace function public.get_next_onboarding_task(p_user_id uuid)
returns table (
  task_id uuid,
  task_key text,
  task_title text,
  task_description text,
  order_index int
) as $$
begin
  return query
  select 
    ot.id,
    ot.key,
    ot.title,
    ot.description,
    ot.order_index
  from public.onboarding_tasks ot
  where not exists (
    select 1 
    from public.user_onboarding_progress uop
    where uop.user_id = p_user_id
    and uop.task_id = ot.id
    and uop.completed = true
  )
  order by ot.order_index
  limit 1;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- 9. HELPER FUNCTION: Get Coaching Prompt for User
-- ============================================================================

create or replace function public.get_coaching_prompt_for_user(p_user_id uuid)
returns table (
  prompt_id uuid,
  trigger_type text,
  title text,
  message text,
  action_button text,
  action_url text
) as $$
declare
  has_incomplete_task boolean;
  has_replies boolean;
  has_hot_leads boolean;
  has_campaigns boolean;
begin
  -- Check if user has incomplete onboarding tasks
  select exists (
    select 1
    from public.get_next_onboarding_task(p_user_id)
  ) into has_incomplete_task;
  
  if has_incomplete_task then
    return query
    select 
      cp.id,
      cp.trigger_type,
      cp.title,
      cp.message,
      cp.action_button,
      cp.action_url
    from public.coaching_prompts cp
    where cp.trigger_type = 'onboarding_step'
    limit 1;
    return;
  end if;
  
  -- Check for hot leads (replies in last 24 hours)
  -- Try multiple possible table structures
  begin
    -- Try email_replies with user_id
    select exists (
      select 1
      from public.email_replies er
      where er.user_id = p_user_id
      and er.created_at > now() - interval '24 hours'
      and (er.handled = false or er.handled is null)
      limit 1
    ) into has_hot_leads;
  exception when others then
    -- Try email_replies via email_logs
    begin
      select exists (
        select 1
        from public.email_replies er
        join public.email_logs el on er.email_log_id = el.id
        where el.user_id = p_user_id
        and er.created_at > now() - interval '24 hours'
        limit 1
      ) into has_hot_leads;
    exception when others then
      has_hot_leads := false;
    end;
  end;
  
  if has_hot_leads then
    return query
    select 
      cp.id,
      cp.trigger_type,
      cp.title,
      cp.message,
      cp.action_button,
      cp.action_url
    from public.coaching_prompts cp
    where cp.trigger_type = 'hot_leads'
    limit 1;
    return;
  end if;
  
  -- Check for replies in last 7 days (similar flexible approach)
  begin
    select exists (
      select 1
      from public.email_replies er
      where er.user_id = p_user_id
      and er.created_at > now() - interval '7 days'
      limit 1
    ) into has_replies;
  exception when others then
    begin
      select exists (
        select 1
        from public.email_replies er
        join public.email_logs el on er.email_log_id = el.id
        where el.user_id = p_user_id
        and er.created_at > now() - interval '7 days'
        limit 1
      ) into has_replies;
    exception when others then
      has_replies := false;
    end;
  end;
  
  if not has_replies then
    -- Check if user has campaigns (if no replies, maybe they need to send more)
    begin
      select exists (
        select 1
        from public.campaigns c
        where c.user_id = p_user_id
        limit 1
      ) into has_campaigns;
    exception when others then
      has_campaigns := false;
    end;
    
    if has_campaigns then
      return query
      select 
        cp.id,
        cp.trigger_type,
        cp.title,
        cp.message,
        cp.action_button,
        cp.action_url
      from public.coaching_prompts cp
      where cp.trigger_type = 'no_replies'
      limit 1;
      return;
    end if;
  end if;
  
  -- Default: encourage activity
  return query
  select 
    cp.id,
    cp.trigger_type,
    cp.title,
    cp.message,
    cp.action_button,
    cp.action_url
  from public.coaching_prompts cp
  where cp.trigger_type = 'no_activity'
  limit 1;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- 10. COMMENTS FOR DOCUMENTATION
-- ============================================================================

comment on table public.owner_playbook_sections is 'In-app documentation sections for the SmartSend Owner Playbook';
comment on table public.owner_playbook_steps is 'Individual content items within playbook sections';
comment on table public.onboarding_tasks is 'Checklist tasks for the guided onboarding flow';
comment on table public.user_onboarding_progress is 'Tracks which onboarding tasks each user has completed';
comment on table public.coaching_prompts is 'AI coaching messages that guide users to take action';
comment on function public.get_next_onboarding_task is 'Returns the next incomplete onboarding task for a user';
comment on function public.get_coaching_prompt_for_user is 'Returns the most relevant coaching prompt based on user state';


























