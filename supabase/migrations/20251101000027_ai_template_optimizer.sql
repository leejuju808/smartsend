-- Smart Template AI (Autonomous Rewriter)
-- Creates tables for AI-driven template optimization and A/B testing

-- Main templates table
create table if not exists ai_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text,
  version int default 1,
  body text not null,
  performance jsonb default '{}'::jsonb, -- open_rate, reply_rate, conversions
  status text default 'active', -- active | archived | testing
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Template test variants (A/B testing)
create table if not exists ai_template_tests (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references ai_templates(id) on delete cascade,
  variant_body text not null,
  variant_version int not null,
  metrics jsonb default '{}'::jsonb, -- open_rate, reply_rate, conversions, sends
  winner boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_ai_templates_org on ai_templates(org_id);
create index if not exists idx_ai_templates_status on ai_templates(status);
create index if not exists idx_ai_template_tests_template on ai_template_tests(template_id);
create index if not exists idx_ai_template_tests_winner on ai_template_tests(winner);

-- Add column to send_queue to track which template test variant was used
alter table send_queue 
  add column if not exists ai_template_test_id uuid references ai_template_tests(id) on delete set null;

-- Add column to campaigns to link to ai_template
alter table campaigns 
  add column if not exists ai_template_id uuid references ai_templates(id) on delete set null;

-- Create index for performance
create index if not exists idx_campaigns_ai_template on campaigns(ai_template_id);

-- RLS policies
alter table ai_templates enable row level security;
alter table ai_template_tests enable row level security;

-- Templates: org members can read/write
create policy "ai_templates: org read" on ai_templates
  for select
  using (
    exists (
      select 1 from organization_members om
      where om.org_id = ai_templates.org_id
      and om.user_id = auth.uid()
    )
  );

create policy "ai_templates: org write" on ai_templates
  for all
  using (
    exists (
      select 1 from organization_members om
      where om.org_id = ai_templates.org_id
      and om.user_id = auth.uid()
    )
  );

-- Template tests: org members can read/write
create policy "ai_template_tests: org read" on ai_template_tests
  for select
  using (
    exists (
      select 1 from ai_templates at
      join organization_members om on om.org_id = at.org_id
      where at.id = ai_template_tests.template_id
      and om.user_id = auth.uid()
    )
  );

create policy "ai_template_tests: org write" on ai_template_tests
  for all
  using (
    exists (
      select 1 from ai_templates at
      join organization_members om on om.org_id = at.org_id
      where at.id = ai_template_tests.template_id
      and om.user_id = auth.uid()
    )
  );

-- Function to update template performance metrics
create or replace function update_ai_template_performance()
returns void
language plpgsql
as $$
begin
  -- Update ai_template_tests metrics from send_queue and email events
  update ai_template_tests att
  set metrics = jsonb_build_object(
    'sends', coalesce(sq_stats.sends, 0),
    'opens', coalesce(sq_stats.opens, 0),
    'clicks', coalesce(sq_stats.clicks, 0),
    'replies', coalesce(sq_stats.replies, 0),
    'open_rate', case 
      when coalesce(sq_stats.sends, 0) > 0 
      then round(100.0 * coalesce(sq_stats.opens, 0) / sq_stats.sends, 2)
      else 0 
    end,
    'reply_rate', case 
      when coalesce(sq_stats.sends, 0) > 0 
      then round(100.0 * coalesce(sq_stats.replies, 0) / sq_stats.sends, 2)
      else 0 
    end,
    'click_rate', case 
      when coalesce(sq_stats.sends, 0) > 0 
      then round(100.0 * coalesce(sq_stats.clicks, 0) / sq_stats.sends, 2)
      else 0 
    end
  ),
  updated_at = now()
  from (
    select 
      att2.id,
      count(distinct sq.id) filter (where sq.status = 'sent') as sends,
      count(distinct ee.id) filter (where ee.event_type = 'open') as opens,
      count(distinct ee.id) filter (where ee.event_type = 'click') as clicks,
      count(distinct er.id) as replies
    from ai_template_tests att2
    left join send_queue sq on sq.ai_template_test_id = att2.id
    left join email_logs el on el.id = sq.id and el.status = 'sent'
    left join email_events ee on ee.email_log_id = el.id
    left join email_replies er on er.email_log_id = el.id
    group by att2.id
  ) sq_stats
  where att.id = sq_stats.id;

  -- Update ai_templates performance from main template usage (campaigns using this template but NOT using test variants)
  update ai_templates at
  set performance = jsonb_build_object(
    'sends', coalesce(tmpl_stats.sends, 0),
    'opens', coalesce(tmpl_stats.opens, 0),
    'clicks', coalesce(tmpl_stats.clicks, 0),
    'replies', coalesce(tmpl_stats.replies, 0),
    'open_rate', case 
      when coalesce(tmpl_stats.sends, 0) > 0 
      then round(100.0 * coalesce(tmpl_stats.opens, 0) / tmpl_stats.sends, 2)
      else 0 
    end,
    'reply_rate', case 
      when coalesce(tmpl_stats.sends, 0) > 0 
      then round(100.0 * coalesce(tmpl_stats.replies, 0) / tmpl_stats.sends, 2)
      else 0 
    end,
    'click_rate', case 
      when coalesce(tmpl_stats.sends, 0) > 0 
      then round(100.0 * coalesce(tmpl_stats.clicks, 0) / tmpl_stats.sends, 2)
      else 0 
    end
  ),
  updated_at = now()
  from (
    -- Track sends using this template (campaigns with ai_template_id = at.id where ai_template_test_id is null)
    select 
      at2.id,
      count(distinct sq.id) filter (where sq.status = 'sent' and sq.ai_template_test_id is null) as sends,
      count(distinct ee.id) filter (where ee.event_type = 'open') as opens,
      count(distinct ee.id) filter (where ee.event_type = 'click') as clicks,
      count(distinct er.id) as replies
    from ai_templates at2
    left join campaigns c on c.ai_template_id = at2.id
    left join send_queue sq on sq.campaign_id = c.id 
      and sq.ai_template_test_id is null -- only count main template usage, not test variants
    left join email_logs el on el.id = sq.id and el.status = 'sent'
    left join email_events ee on ee.email_log_id = el.id
    left join email_replies er on er.email_log_id = el.id
    group by at2.id
  ) tmpl_stats
  where at.id = tmpl_stats.id;
end;
$$;

-- Function to auto-promote winning variants
create or replace function promote_ai_template_winner(p_template_id uuid)
returns void
language plpgsql
as $$
declare
  v_winner_id uuid;
  v_winner_body text;
  v_winner_version int;
begin
  -- Find winner based on reply_rate (with minimum 100 sends)
  select att.id, att.variant_body, att.variant_version
  into v_winner_id, v_winner_body, v_winner_version
  from ai_template_tests att
  where att.template_id = p_template_id
    and (att.metrics->>'sends')::int >= 100
    and att.winner = false
  order by (att.metrics->>'reply_rate')::float desc
  limit 1;

  if v_winner_id is not null then
    -- Mark as winner
    update ai_template_tests
    set winner = true, updated_at = now()
    where id = v_winner_id;

    -- Update main template with winning version
    update ai_templates
    set 
      body = v_winner_body,
      version = v_winner_version,
      updated_at = now()
    where id = p_template_id;

    -- Unmark other variants
    update ai_template_tests
    set winner = false, updated_at = now()
    where template_id = p_template_id
      and id != v_winner_id;
  end if;
end;
$$;

