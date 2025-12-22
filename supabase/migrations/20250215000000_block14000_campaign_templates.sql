-- Block 14000: Smart Campaign Builder v1 - Campaign Templates + Steps
-- Pre-built roofing campaigns with goal-based setup

-- 1. Campaign Templates Table
create table if not exists campaign_templates (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,         -- e.g. 'roofing-storm-damage-estimates'
  name text not null,                -- "Storm Damage Estimate Campaign"
  niche text not null,               -- 'roofing'
  goal text not null,                -- 'book_estimates' | 'get_quotes' | 'reactivate_past_customers'
  description text,
  recommended_steps int not null default 3,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- 2. Campaign Template Steps Table
create table if not exists campaign_template_steps (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references campaign_templates(id) on delete cascade,
  step_order int not null, -- 1,2,3...
  delay_days int not null default 0, -- days after previous step
  subject_template text not null,
  body_template text not null,
  created_at timestamptz default now(),
  unique(template_id, step_order)
);

-- Indexes
create index if not exists idx_campaign_templates_niche on campaign_templates(niche);
create index if not exists idx_campaign_templates_goal on campaign_templates(goal);
create index if not exists idx_campaign_templates_active on campaign_templates(is_active) where is_active = true;
create index if not exists idx_template_steps_template on campaign_template_steps(template_id);
create index if not exists idx_template_steps_order on campaign_template_steps(template_id, step_order);

-- RLS Policies
alter table campaign_templates enable row level security;
alter table campaign_template_steps enable row level security;

-- Templates are readable by all authenticated users
create policy campaign_templates_select on campaign_templates
  for select
  to authenticated
  using (is_active = true);

-- Steps are readable by all authenticated users (via template)
create policy campaign_template_steps_select on campaign_template_steps
  for select
  to authenticated
  using (
    exists (
      select 1 from campaign_templates
      where campaign_templates.id = campaign_template_steps.template_id
      and campaign_templates.is_active = true
    )
  );

-- Admin/service role can insert/update templates (for seeding)
create policy campaign_templates_admin on campaign_templates
  for all
  to service_role
  using (true)
  with check (true);

create policy campaign_template_steps_admin on campaign_template_steps
  for all
  to service_role
  using (true)
  with check (true);

-- Seed Data: Roofing Template Pack v1
-- Insert templates (using DO block to handle potential duplicates)
do $$
declare
  template1_id uuid;
  template2_id uuid;
  template3_id uuid;
begin
  -- Template 1: Storm Damage Estimate Campaign
  insert into campaign_templates (slug, name, niche, goal, description, recommended_steps)
  values (
    'roofing-storm-damage-estimates',
    'Storm Damage Estimate Campaign',
    'roofing',
    'book_estimates',
    '3-step outreach to homeowners after recent storms, focused on free inspections & estimates.',
    3
  )
  on conflict (slug) do update set
    name = excluded.name,
    description = excluded.description,
    is_active = true
  returning id into template1_id;

  -- Get template ID if it already exists
  if template1_id is null then
    select id into template1_id from campaign_templates where slug = 'roofing-storm-damage-estimates';
  end if;

  -- Steps for Template 1
  insert into campaign_template_steps (template_id, step_order, delay_days, subject_template, body_template)
  values
  (
    template1_id,
    1,
    0,
    'Quick question about your roof in {{city}}',
    'Hey {{contact.first_name}},

I''m {{sender.first_name}} with {{company.name}} here in {{city}}.

We''ve been fixing a lot of storm damage in your area this week – missing shingles, small leaks, and issues most homeowners don''t see until it''s a big problem.

Would you like a quick, **no-pressure inspection + estimate** in the next few days?

Reply with a good day/time or a best phone number and I''ll set everything up.

{{sender.signature}}'
  ),
  (
    template1_id,
    2,
    3,
    'Still offering free roof checks in {{city}}',
    'Hey {{contact.first_name}},

Just wanted to follow up in case you missed my last note.

We''re still offering **free roof checks** for homeowners in {{city}} after the recent storms. It takes about 20–30 minutes and you get a clear report on any damage + repair options.

Want me to hold a spot for you this week?

{{sender.signature}}'
  ),
  (
    template1_id,
    3,
    6,
    'Last call for this week''s free roof inspections',
    'Hey {{contact.first_name}},

Last quick follow-up from me.

We''re closing out this week''s free roof inspection schedule in {{city}}. If you''d like us to **take a look and give you an honest quote**, reply here and I''ll lock in a time.

If not, no worries at all – I''ll close this out on my end.

{{sender.signature}}'
  )
  on conflict (template_id, step_order) do update set
    subject_template = excluded.subject_template,
    body_template = excluded.body_template,
    delay_days = excluded.delay_days;

  -- Template 2: Annual Roof Maintenance & Inspection
  insert into campaign_templates (slug, name, niche, goal, description, recommended_steps)
  values (
    'roofing-annual-maintenance',
    'Annual Roof Maintenance & Inspection',
    'roofing',
    'get_quotes',
    'Keep roofs out of emergency mode with scheduled inspections and maintenance offers.',
    3
  )
  on conflict (slug) do update set
    name = excluded.name,
    description = excluded.description,
    is_active = true
  returning id into template2_id;

  if template2_id is null then
    select id into template2_id from campaign_templates where slug = 'roofing-annual-maintenance';
  end if;

  -- Steps for Template 2
  insert into campaign_template_steps (template_id, step_order, delay_days, subject_template, body_template)
  values
  (
    template2_id,
    1,
    0,
    'Annual roof check-up in {{city}}',
    'Hey {{contact.first_name}},

I''m {{sender.first_name}} with {{company.name}} here in {{city}}.

Most homeowners don''t think about their roof until there''s a leak or major damage. But catching small issues early can save thousands.

We''re offering **annual roof inspections** for homeowners in {{city}} – we check shingles, gutters, flashing, and give you a clear report on what needs attention (if anything).

Interested in scheduling one this month?

{{sender.signature}}'
  ),
  (
    template2_id,
    2,
    4,
    'Following up on roof maintenance',
    'Hey {{contact.first_name}},

Just wanted to follow up on my note about annual roof maintenance.

A quick inspection can catch issues before they become expensive repairs. We''re booking inspections for {{city}} homeowners this month.

Want to lock in a time?

{{sender.signature}}'
  ),
  (
    template2_id,
    3,
    7,
    'Last note on roof maintenance',
    'Hey {{contact.first_name}},

Last quick note from me about roof maintenance.

If you''re interested in a free inspection, reply here and I''ll get you scheduled. If not, no worries – I''ll close this out.

{{sender.signature}}'
  )
  on conflict (template_id, step_order) do update set
    subject_template = excluded.subject_template,
    body_template = excluded.body_template,
    delay_days = excluded.delay_days;

  -- Template 3: Past Customer Reactivation
  insert into campaign_templates (slug, name, niche, goal, description, recommended_steps)
  values (
    'roofing-past-customers-reactivation',
    'Past Customer Reactivation',
    'roofing',
    'reactivate_past_customers',
    'Re-engage past customers with tune-ups, gutter cleaning, and multi-service offers.',
    3
  )
  on conflict (slug) do update set
    name = excluded.name,
    description = excluded.description,
    is_active = true
  returning id into template3_id;

  if template3_id is null then
    select id into template3_id from campaign_templates where slug = 'roofing-past-customers-reactivation';
  end if;

  -- Steps for Template 3
  insert into campaign_template_steps (template_id, step_order, delay_days, subject_template, body_template)
  values
  (
    template3_id,
    1,
    0,
    'Quick check-in from {{company.name}}',
    'Hey {{contact.first_name}},

It''s {{sender.first_name}} from {{company.name}} – we did some work on your roof a while back.

Just wanted to check in and see how everything''s holding up. We''re also offering **tune-ups and gutter cleaning** for past customers this season.

Want me to schedule a quick inspection?

{{sender.signature}}'
  ),
  (
    template3_id,
    2,
    5,
    'Following up on tune-up offer',
    'Hey {{contact.first_name}},

Following up on my note about tune-ups and gutter cleaning.

We''re offering special rates for past customers this month. A quick inspection can catch any issues before winter hits.

Interested?

{{sender.signature}}'
  ),
  (
    template3_id,
    3,
    10,
    'Last note on tune-ups',
    'Hey {{contact.first_name}},

Last quick note from me about tune-ups and maintenance.

If you''re interested, reply here and I''ll get you scheduled. If not, no worries at all.

{{sender.signature}}'
  )
  on conflict (template_id, step_order) do update set
    subject_template = excluded.subject_template,
    body_template = excluded.body_template,
    delay_days = excluded.delay_days;

end $$;

