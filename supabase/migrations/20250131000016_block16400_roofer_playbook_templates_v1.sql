-- Block 16400 — Roofer Playbook Templates v1
-- One-Click "Storm / Repair / Inspection" Campaigns
-- Makes SmartSend feel made for roofers, not generic SaaS

-- 1. Add missing columns to campaign_templates
alter table campaign_templates
  add column if not exists audience_hint text,
  add column if not exists industry text default 'roofing';

-- Map niche to industry for existing rows
update campaign_templates
set industry = niche
where industry is null and niche is not null;

-- 2. Add use_ai_opener column to campaign_template_steps
alter table campaign_template_steps
  add column if not exists use_ai_opener boolean not null default true;

-- 3. Create index on template_id, step_order if it doesn't exist
create index if not exists idx_campaign_template_steps_template_order
  on campaign_template_steps (template_id, step_order);

-- 4. Seed Core Roofer Templates
do $$
declare
  storm_template_id uuid;
  past_customer_template_id uuid;
  open_quote_template_id uuid;
begin
  -- A. roofing_storm_outreach
  insert into campaign_templates (
    key, name, description, audience_hint, goal, industry, is_active, slug
  )
  values (
    'roofing_storm_outreach',
    'Storm Damage Outreach',
    'After hail/wind in local area, reach out to homeowners for free inspections.',
    'Use for homeowners in recently storm-hit areas.',
    'book_inspection',
    'roofing',
    true,
    'roofing-storm-outreach'
  )
  on conflict (slug) do update set
    key = excluded.key,
    name = excluded.name,
    description = excluded.description,
    audience_hint = excluded.audience_hint,
    goal = excluded.goal,
    industry = excluded.industry,
    is_active = true
  returning id into storm_template_id;

  if storm_template_id is null then
    select id into storm_template_id from campaign_templates where key = 'roofing_storm_outreach' or slug = 'roofing-storm-outreach' limit 1;
  end if;

  -- Delete existing steps and insert new ones
  delete from campaign_template_steps where template_id = storm_template_id;

  insert into campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days, use_ai_opener)
  values
  (
    storm_template_id,
    0,
    'Quick roof check after the recent storm in {{city}}',
    'Hi {{first_name}},

This is {{company_name}} here in {{city}}. We''ve been out helping homeowners after the recent storm and noticed a lot of roofs with hidden hail and wind damage.

We''re offering a free, no-pressure roof inspection this week to document any issues that might qualify for an insurance claim.

{{opener}}

Would you like us to swing by for a quick roof + attic check in the next few days?

Best,
{{sender_name}}
{{company_name}}
{{company_phone}}',
    0,
    true
  ),
  (
    storm_template_id,
    1,
    'Still doing free roof checks in {{city}} this week',
    'Hi {{first_name}},

Just circling back — we''re still doing free storm damage checks in {{city}} this week.

Even small bruises or lifted shingles can cause leaks months from now. It''s usually easier to document this now while the storm is still recent.

Do you want us to stop by for a quick inspection and photos? No pressure, just clear answers.

Best,
{{sender_name}}
{{company_name}}',
    3,
    true
  ),
  (
    storm_template_id,
    2,
    'Last call for storm roof inspections in {{city}}',
    'Hi {{first_name}},

We''re finishing up storm inspections in {{city}} soon.

If you''d like a professional to climb up, take photos, and let you know if there''s anything to worry about — reply "INSPECTION" and we''ll get you on the schedule.

If you''re all set, no worries — we''ll close this out on our side.

Thanks,
{{sender_name}}
{{company_name}}',
    5,
    true
  );

  -- B. roofing_past_customer_checkin
  insert into campaign_templates (
    key, name, description, audience_hint, goal, industry, is_active, slug
  )
  values (
    'roofing_past_customer_checkin',
    'Past Customer Roof Check-In',
    'Reach out to past installs/repairs to check on work and offer maintenance.',
    'Use for past customers who had work done previously.',
    'revive_past_customers',
    'roofing',
    true,
    'roofing-past-customer-checkin'
  )
  on conflict (slug) do update set
    key = excluded.key,
    name = excluded.name,
    description = excluded.description,
    audience_hint = excluded.audience_hint,
    goal = excluded.goal,
    industry = excluded.industry,
    is_active = true
  returning id into past_customer_template_id;

  if past_customer_template_id is null then
    select id into past_customer_template_id from campaign_templates where key = 'roofing_past_customer_checkin' or slug = 'roofing-past-customer-checkin' limit 1;
  end if;

  delete from campaign_template_steps where template_id = past_customer_template_id;

  insert into campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days, use_ai_opener)
  values
  (
    past_customer_template_id,
    0,
    'Quick check-in on your roof in {{city}}',
    'Hi {{first_name}},

This is {{company_name}} — we worked on your roof at {{street_or_area}} a while back.

We like to check in with past customers to make sure everything is still performing the way it should, especially after the last few seasons.

{{opener}}

Would you be interested in a quick roof + gutter checkup to make sure everything is still watertight?

Best,
{{sender_name}}
{{company_name}}',
    0,
    true
  ),
  (
    past_customer_template_id,
    1,
    'Roof + gutter tune-up for {{street_or_area}}',
    'Hi {{first_name}},

A lot of small roof issues start with clogged gutters, loose flashing, or cracked seals.

We''re running a simple roof + gutter tune-up for past customers in {{city}} — quick inspection, sealant touch-ups, and debris removal.

Would you like pricing for your home?

Best,
{{sender_name}}
{{company_name}}',
    5,
    true
  );

  -- C. roofing_open_quote_followup
  insert into campaign_templates (
    key, name, description, audience_hint, goal, industry, is_active, slug
  )
  values (
    'roofing_open_quote_followup',
    'Open Quote Follow-Up',
    'Follow up on old estimates that never closed to revive opportunities.',
    'Use for leads who received quotes but never responded or closed.',
    'close_open_quotes',
    'roofing',
    true,
    'roofing-open-quote-followup'
  )
  on conflict (slug) do update set
    key = excluded.key,
    name = excluded.name,
    description = excluded.description,
    audience_hint = excluded.audience_hint,
    goal = excluded.goal,
    industry = excluded.industry,
    is_active = true
  returning id into open_quote_template_id;

  if open_quote_template_id is null then
    select id into open_quote_template_id from campaign_templates where key = 'roofing_open_quote_followup' or slug = 'roofing-open-quote-followup' limit 1;
  end if;

  delete from campaign_template_steps where template_id = open_quote_template_id;

  insert into campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days, use_ai_opener)
  values
  (
    open_quote_template_id,
    0,
    'Still thinking about your roof estimate in {{city}}?',
    'Hi {{first_name}},

This is {{company_name}} — we sent you a roof estimate a while back for your place in {{city}}.

Just wanted to check in and see where you''re at with things:
- Still comparing quotes?
- Not sure what to do yet?
- Project on hold?

{{opener}}

If it would help, we can walk through the estimate again, tweak options, or break it into phases to fit your budget.

Best,
{{sender_name}}
{{company_name}}',
    0,
    true
  ),
  (
    open_quote_template_id,
    1,
    'Locking in your roof pricing in {{city}}',
    'Hi {{first_name}},

Material prices and labor costs tend to move around over time.

We''re keeping your current estimate valid until {{price_lock_date}}. After that, we may need to re-price based on supplier costs.

If you''d like to keep this number locked in, we can schedule a quick call or site review this week.

Best,
{{sender_name}}
{{company_name}}',
    4,
    true
  );

end $$;



























































