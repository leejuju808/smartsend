-- Block 15100 — Smart Campaign Templates v1
-- (Roofing Playbook: Storm, Inspection, Reactivation)
-- Extends campaign_templates schema and seeds 3 roofing templates

-- 1. Add missing columns to campaign_templates if they don't exist
alter table campaign_templates
  add column if not exists key text,
  add column if not exists short_description text,
  add column if not exists recommended_plan text check (
    recommended_plan in ('starter', 'growth', 'domination')
  );

-- 2. Populate key from slug if key is null (backward compatibility)
update campaign_templates
set key = replace(slug, 'roofing-', '')
where key is null and slug is not null;

-- 3. Populate short_description from description if short_description is null
update campaign_templates
set short_description = description
where short_description is null and description is not null;

-- 4. Create unique index on (niche, key) as specified
-- Drop existing index if it exists
drop index if exists campaign_templates_niche_key_idx;
-- Create unique index (only where key is not null to allow nulls)
create unique index campaign_templates_niche_key_idx
  on campaign_templates (niche, key)
  where key is not null;

-- 5. Create index on template_id, step_order for campaign_template_steps
create index if not exists campaign_template_steps_template_order_idx
  on campaign_template_steps (template_id, step_order);

-- 6. Seed: 3 Roofing Templates (Block 15100 spec)
do $$
declare
  storm_template_id uuid;
  inspection_template_id uuid;
  reactivation_template_id uuid;
begin
  -- Storm Damage Blast
  insert into campaign_templates (niche, key, name, short_description, goal, recommended_plan, slug, description, is_active)
  values (
    'roofing',
    'storm_damage',
    'Storm Damage Homeowners',
    'Fast-response outreach to homeowners after a big storm.',
    'book_estimates',
    'growth',
    'roofing-storm-damage-estimates',
    'Fast-response outreach to homeowners after a big storm.',
    true
  )
  on conflict (slug) do update set
    key = excluded.key,
    short_description = excluded.short_description,
    recommended_plan = excluded.recommended_plan,
    name = excluded.name,
    goal = excluded.goal,
    is_active = true
  returning id into storm_template_id;

  if storm_template_id is null then
    select id into storm_template_id from campaign_templates where key = 'storm_damage' or slug = 'roofing-storm-damage-estimates' limit 1;
  end if;

  -- Annual Roof Inspection
  insert into campaign_templates (niche, key, name, short_description, goal, recommended_plan, slug, description, is_active)
  values (
    'roofing',
    'annual_inspection',
    'Annual Roof Inspection',
    'Remind past customers & local homeowners to schedule yearly inspections.',
    'book_inspections',
    'starter',
    'roofing-annual-inspection',
    'Remind past customers & local homeowners to schedule yearly inspections.',
    true
  )
  on conflict (slug) do update set
    key = excluded.key,
    short_description = excluded.short_description,
    recommended_plan = excluded.recommended_plan,
    name = excluded.name,
    goal = excluded.goal,
    is_active = true
  returning id into inspection_template_id;

  if inspection_template_id is null then
    select id into inspection_template_id from campaign_templates where key = 'annual_inspection' or slug = 'roofing-annual-inspection' limit 1;
  end if;

  -- Old Quotes Reactivation
  insert into campaign_templates (niche, key, name, short_description, goal, recommended_plan, slug, description, is_active)
  values (
    'roofing',
    'reactivation',
    'Old Quotes Reactivation',
    'Follow up on old, lost, or ignored quotes to revive jobs.',
    'book_estimates',
    'domination',
    'roofing-reactivation',
    'Follow up on old, lost, or ignored quotes to revive jobs.',
    true
  )
  on conflict (slug) do update set
    key = excluded.key,
    short_description = excluded.short_description,
    recommended_plan = excluded.recommended_plan,
    name = excluded.name,
    goal = excluded.goal,
    is_active = true
  returning id into reactivation_template_id;

  if reactivation_template_id is null then
    select id into reactivation_template_id from campaign_templates where key = 'reactivation' or slug = 'roofing-reactivation' limit 1;
  end if;

  -- Storm Damage Steps
  delete from campaign_template_steps where template_id = storm_template_id;
  
  insert into campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days)
  select
    storm_template_id,
    s.step_order,
    s.subject_template,
    s.body_template,
    s.delay_days
  from (
    values
    (1,
     'Storm damage in {{city}} – quick roof check?',
     'Hey {{first_name}},

{{company_name}} has been helping homeowners around {{city}} clean up after the recent storm.

We''re offering quick, no-pressure roof checks to spot:

- Missing shingles

- Hidden leaks

- Damage that could cause bigger problems later

We can usually get someone out within 24–48 hours.

Would you like a quick inspection this week?

– {{company_name}}',
     0),
    (2,
     'Quick follow-up on your roof after the storm',
     'Hey {{first_name}},

Just checking back in about your roof after the storm in {{city}}.

We''re still in the area doing inspections and repairs. If you''d like us to take a look, we can:

- Check for storm damage

- Take photos

- Give you a clear recommendation

Would you like to grab a time later this week?

– {{company_name}}',
     2),
    (3,
     'Last call: storm roof check in {{city}}',
     'Hey {{first_name}},

We''re wrapping up our storm inspections in {{city}}.

If you''d like us to give your roof a once-over before we move on, reply here with a good time or just say "call me" and we''ll reach out.

Either way, hope everything is okay with your place.

– {{company_name}}',
     5)
  ) as s(step_order, subject_template, body_template, delay_days);

  -- Annual Inspection Steps
  delete from campaign_template_steps where template_id = inspection_template_id;
  
  insert into campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days)
  select
    inspection_template_id,
    s.step_order,
    s.subject_template,
    s.body_template,
    s.delay_days
  from (
    values
    (1,
     'Quick annual roof check in {{city}}',
     'Hi {{first_name}},

We recommend a simple annual roof check to avoid surprise leaks and bigger repairs.

{{company_name}} is in {{city}} this month doing inspections. We:

- Walk the roof

- Take photos

- Flag any issues early

Would you like to schedule a quick inspection?

– {{company_name}}',
     0),
    (2,
     'Did you still want that roof inspection?',
     'Hey {{first_name}},

Just following up on the annual roof inspection.

Even if everything looks fine from the ground, small issues can turn into expensive fixes.

Want us to put you on the schedule?

– {{company_name}}',
     4)
  ) as s(step_order, subject_template, body_template, delay_days);

  -- Reactivation Steps
  delete from campaign_template_steps where template_id = reactivation_template_id;
  
  insert into campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days)
  select
    reactivation_template_id,
    s.step_order,
    s.subject_template,
    s.body_template,
    s.delay_days
  from (
    values
    (1,
     'Still thinking about the roof project?',
     'Hey {{first_name}},

We talked before about work on your roof in {{city}}, but it looks like things paused on your end.

No pressure, but I wanted to check in and see if:

- You went a different direction

- You''re still considering it

- Something changed with the project

If you''d like us to revisit the numbers or adjust the scope, happy to help.

– {{company_name}}',
     0),
    (2,
     'Want us to re-check your old quote?',
     'Hi {{first_name}},

Material and labor prices have shifted since we first talked.

If you''d like, we can:

- Review your original quote

- See if anything can be adjusted

- Give you a clear updated price

Want us to take another look?

– {{company_name}}',
     3),
    (3,
     'Should we close out your file?',
     'Hey {{first_name}},

We don''t want to bug you, so this will be the last note about your roof project.

If you still want help, just reply here and we''ll pick things back up.

Otherwise, we''ll go ahead and close things out on our end.

– {{company_name}}',
     7)
  ) as s(step_order, subject_template, body_template, delay_days);

end $$;

