-- Block 10900 — Roofing Templates Library
-- Preloaded Campaign Templates, Follow-Up Templates, and Snippets for Roofing Companies

-- ============================================================================
-- 1. TEMPLATES_CAMPAIGNS TABLE
-- ============================================================================

create table if not exists public.templates_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  steps jsonb not null, -- Array of { subject, body, delayDays }
  category text not null, -- 'hail', 'wind', 'insurance', 'leak', 'general', 'nearby', 'seasonal', 'post-quote', 're-engagement'
  tags text[], -- For filtering: ['storm', 'emergency', 'insurance', etc.]
  is_global boolean not null default true, -- Global templates available to all orgs
  org_id uuid references public.organizations(id) on delete cascade, -- null = global, set = org-specific
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_templates_campaigns_category on public.templates_campaigns(category);
create index if not exists idx_templates_campaigns_org on public.templates_campaigns(org_id);
create index if not exists idx_templates_campaigns_global on public.templates_campaigns(is_global);
create index if not exists idx_templates_campaigns_tags on public.templates_campaigns using gin(tags);

-- ============================================================================
-- 2. TEMPLATES_SNIPPETS TABLE
-- ============================================================================

create table if not exists public.templates_snippets (
  id uuid primary key default gen_random_uuid(),
  category text not null, -- 'local_proof', 'insurance_support', 'soft_cta', 'social_proof', 'urgency_storm'
  body text not null,
  is_global boolean not null default true,
  org_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz default now()
);

create index if not exists idx_templates_snippets_category on public.templates_snippets(category);
create index if not exists idx_templates_snippets_org on public.templates_snippets(org_id);
create index if not exists idx_templates_snippets_global on public.templates_snippets(is_global);

-- ============================================================================
-- 3. UPDATE TRIGGERS
-- ============================================================================

create or replace function update_templates_campaigns_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_templates_campaigns_updated_at
before update on public.templates_campaigns
for each row
execute function update_templates_campaigns_updated_at();

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

alter table public.templates_campaigns enable row level security;
alter table public.templates_snippets enable row level security;

-- Templates are readable by all authenticated users (global) or org members (org-specific)
create policy "templates_campaigns_select"
  on public.templates_campaigns for select
  using (
    is_global = true 
    or org_id is null
    or exists (
      select 1 from public.org_memberships om
      where om.org_id = templates_campaigns.org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
    )
  );

create policy "templates_snippets_select"
  on public.templates_snippets for select
  using (
    is_global = true 
    or org_id is null
    or exists (
      select 1 from public.org_memberships om
      where om.org_id = templates_snippets.org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
    )
  );

-- Only service role can insert/update templates (preloaded content)
create policy "templates_campaigns_admin"
  on public.templates_campaigns for all
  using (false) with check (false);

create policy "templates_snippets_admin"
  on public.templates_snippets for all
  using (false) with check (false);

-- ============================================================================
-- 5. SEED TEMPLATES
-- ============================================================================

-- Template 1: Hail Damage Outreach
insert into public.templates_campaigns (title, description, steps, category, tags, is_global)
values (
  'Hail Damage Outreach',
  '3-step sequence for reaching out after hail storms. Best for storm seasons.',
  '[
    {
      "stepNumber": 1,
      "subject": "Quick question about the storm last week",
      "body": "{{opener}}\n\n{{local_reference}} A lot of roofs in {{city}} took hits that aren''t visible from the ground.\n\n{{roof_context}} We do free inspections — no pressure, just want to make sure you''re covered.\n\nWant me to take a quick look this week?",
      "delayDays": 0
    },
    {
      "stepNumber": 2,
      "subject": "We''re helping homeowners in {{city}} this week",
      "body": "We''re already doing work on {{street|your street}} this week and noticed several roofs with hail damage.\n\nMost homeowners don''t realize their shingles are bruised until leaks start showing up months later.\n\nWe can stop by tomorrow afternoon if you want us to take a look. No cost, no obligation.",
      "delayDays": 3
    },
    {
      "stepNumber": 3,
      "subject": "Just checking in",
      "body": "Still need help assessing your roof after the hail?\n\nWe''re in {{city}} today if you want us to stop by. Most roofs we inspected had hidden bruising that insurance covers.\n\nHappy to walk you through the process.",
      "delayDays": 4
    }
  ]'::jsonb,
  'hail',
  ARRAY['hail', 'storm', 'damage', 'insurance'],
  true
);

-- Template 2: Wind Damage Outreach
insert into public.templates_campaigns (title, description, steps, category, tags, is_global)
values (
  'Wind Damage Outreach',
  '3-step sequence for wind damage follow-ups. Mentions lifted shingles and leaks.',
  '[
    {
      "stepNumber": 1,
      "subject": "Quick question about your roof",
      "body": "{{opener}}\n\n{{local_reference}} We''ve been seeing a lot of wind damage around {{city}} — lifted shingles, damaged ridge caps, and leaks starting to show.\n\n{{roof_context}}\n\nWant me to take a quick look?",
      "delayDays": 0
    },
    {
      "stepNumber": 2,
      "subject": "We''re in your area this week",
      "body": "We''re already working on a few roofs in {{neighborhood|your neighborhood}} this week.\n\nWind lifted shingles in most neighborhoods around {{city}}. Most people don''t notice until water starts coming in.\n\nCan stop by tomorrow afternoon if you want us to check it out.",
      "delayDays": 3
    },
    {
      "stepNumber": 3,
      "subject": "Still need help with your roof?",
      "body": "Just checking in — still need help assessing wind damage?\n\nWe''re in {{city}} today. Most roofs we inspected had lifted shingles and damaged flashing that needs attention.\n\nHappy to take a look this week.",
      "delayDays": 4
    }
  ]'::jsonb,
  'wind',
  ARRAY['wind', 'storm', 'damage'],
  true
);

-- Template 3: Insurance Claim Assistance
insert into public.templates_campaigns (title, description, steps, category, tags, is_global)
values (
  'Insurance Claim Assistance',
  '3-step sequence helping homeowners file insurance claims. We document everything for adjusters.',
  '[
    {
      "stepNumber": 1,
      "subject": "We help homeowners file claims",
      "body": "{{opener}}\n\nWe help homeowners in {{city}} document roof damage and file insurance claims.\n\n{{roof_context}} Most insurance companies cover storm damage, but you need proper documentation.\n\nWe meet with your adjuster at no cost — just want to make sure you get what you''re owed.",
      "delayDays": 0
    },
    {
      "stepNumber": 2,
      "subject": "We document everything for adjusters",
      "body": "We''ve helped over 30 homeowners after this storm file successful claims.\n\nWe document everything your adjuster needs: photos, measurements, damage reports. We meet with them at your property — no cost to you.\n\nWant us to take a look and prepare the documentation?",
      "delayDays": 3
    },
    {
      "stepNumber": 3,
      "subject": "Still need help with your insurance claim?",
      "body": "Just checking in — still need help documenting damage for your insurance?\n\nWe''re in {{city}} today. We can prepare everything your adjuster needs and meet them at your property.\n\nHappy to walk you through the process.",
      "delayDays": 4
    }
  ]'::jsonb,
  'insurance',
  ARRAY['insurance', 'claims', 'documentation'],
  true
);

-- Template 4: Roof Leak Emergency
insert into public.templates_campaigns (title, description, steps, category, tags, is_global)
values (
  'Roof Leak Emergency',
  'Urgent 3-step sequence for roof leaks. Same-day or next-morning scheduling.',
  '[
    {
      "stepNumber": 1,
      "subject": "Urgent: Roof leak?",
      "body": "{{opener}}\n\nIf you''re dealing with a roof leak, we can help.\n\n{{local_reference}} We do emergency repairs and can usually get someone out same-day or first thing tomorrow morning.\n\n{{roof_context}}\n\nWant us to take a look today?",
      "delayDays": 0
    },
    {
      "stepNumber": 2,
      "subject": "We can stop by today",
      "body": "Still dealing with that leak?\n\nWe''re in {{city}} today and can stop by this afternoon to assess and patch it temporarily.\n\nMost leaks get worse if left untreated. We can get someone out today if you need.",
      "delayDays": 1
    },
    {
      "stepNumber": 3,
      "subject": "Just checking in on the leak",
      "body": "Just checking in — did you get the leak taken care of?\n\nIf not, we''re available tomorrow morning. We can assess the damage and give you options.\n\nWant us to stop by?",
      "delayDays": 2
    }
  ]'::jsonb,
  'leak',
  ARRAY['leak', 'emergency', 'urgent'],
  true
);

-- Template 5: General Roofing Outreach
insert into public.templates_campaigns (title, description, steps, category, tags, is_global)
values (
  'General Roofing Outreach',
  'Soft, non-pushy 3-step sequence. Good for non-storm seasons.',
  '[
    {
      "stepNumber": 1,
      "subject": "Quick question about your roof",
      "body": "{{opener}}\n\n{{local_reference}} We''re checking in with homeowners in {{city}} about roofing needs.\n\n{{roof_context}} These freeze-thaw swings can cause issues that aren''t obvious until leaks start.\n\nWant me to take a quick look?",
      "delayDays": 0
    },
    {
      "stepNumber": 2,
      "subject": "We''re in your area this week",
      "body": "We''re already doing work on {{street|your street}} this week.\n\nPerfect time to catch small roof issues before they turn big. Most people don''t notice problems until they see leaks or missing shingles.\n\nCan stop by tomorrow afternoon if you want us to check it out.",
      "delayDays": 4
    },
    {
      "stepNumber": 3,
      "subject": "Just checking in",
      "body": "Still need help with your roof?\n\nWe''re in {{city}} this week. These weather swings can cause cracked shingles and lifted flashing.\n\nHappy to take a look if you want.",
      "delayDays": 5
    }
  ]'::jsonb,
  'general',
  ARRAY['general', 'maintenance'],
  true
);

-- Template 6: We''re Working Nearby
insert into public.templates_campaigns (title, description, steps, category, tags, is_global)
values (
  'We''re Working Nearby',
  '3-step sequence leveraging social proof. We''re already doing work on their street/neighborhood.',
  '[
    {
      "stepNumber": 1,
      "subject": "We''re already doing work on {{street}}",
      "body": "We''re already doing work on {{street}} this week and wanted to reach out.\n\n{{local_reference}} We just finished two roofs on {{street}} and noticed several others that could use attention.\n\n{{roof_context}}\n\nWant me to take a quick look while we''re in the area?",
      "delayDays": 0
    },
    {
      "stepNumber": 2,
      "subject": "We''re in {{neighborhood}} this week",
      "body": "We''re already working in {{neighborhood|your neighborhood}} this week.\n\nYour area got hit hardest last week. We''ve helped over 30 homeowners after this storm.\n\nCan stop by tomorrow afternoon if you want us to check your roof.",
      "delayDays": 2
    },
    {
      "stepNumber": 3,
      "subject": "Still in your area this week",
      "body": "We''re still working in {{neighborhood|your neighborhood}} this week.\n\nMost roofs we inspected had hidden damage that wasn''t visible from the ground.\n\nWant us to take a look?",
      "delayDays": 3
    }
  ]'::jsonb,
  'nearby',
  ARRAY['nearby', 'social_proof', 'local'],
  true
);

-- Template 7: Seasonal Maintenance
insert into public.templates_campaigns (title, description, steps, category, tags, is_global)
values (
  'Seasonal Maintenance',
  '3-step sequence for seasonal roof issues: winter freeze-thaw, summer heat, fall debris.',
  '[
    {
      "stepNumber": 1,
      "subject": "{{season}} roof check",
      "body": "{{opener}}\n\n{{local_reference}} {{seasonal_context}}\n\n{{roof_context}} These seasonal changes can cause issues that aren''t obvious until leaks start.\n\nWant me to take a quick look?",
      "delayDays": 0
    },
    {
      "stepNumber": 2,
      "subject": "We''re doing {{season}} inspections this week",
      "body": "We''re doing {{season}} roof inspections in {{city}} this week.\n\nPerfect time to catch small issues before they turn big. Most people don''t notice problems until they see leaks or missing shingles.\n\nCan stop by tomorrow afternoon if you want us to check it out.",
      "delayDays": 5
    },
    {
      "stepNumber": 3,
      "subject": "Just checking in",
      "body": "Still need help with your {{season}} roof check?\n\nWe''re in {{city}} this week. These seasonal changes can cause cracked shingles and lifted flashing.\n\nHappy to take a look if you want.",
      "delayDays": 6
    }
  ]'::jsonb,
  'seasonal',
  ARRAY['seasonal', 'maintenance', 'winter', 'summer', 'fall'],
  true
);

-- Template 8: Post-Quote Follow-Up
insert into public.templates_campaigns (title, description, steps, category, tags, is_global)
values (
  'Post-Quote Follow-Up',
  '3-step sequence after sending a quote. Still need help? Open to checking numbers?',
  '[
    {
      "stepNumber": 1,
      "subject": "Still need help with your roof project?",
      "body": "Just checking in — still need help with your roof project?\n\nWe''re here if you have questions about the quote or want to discuss options.\n\nHappy to walk you through the details or check numbers together.",
      "delayDays": 3
    },
    {
      "stepNumber": 2,
      "subject": "Open to checking numbers together?",
      "body": "Want to go over the quote together?\n\nWe can break down the costs and explain what''s included. No pressure — just want to make sure you have all the info you need.\n\nHappy to chat this week if you want.",
      "delayDays": 4
    },
    {
      "stepNumber": 3,
      "subject": "Happy to walk you through insurance details",
      "body": "Still have questions about the project or insurance?\n\nWe help homeowners navigate insurance claims and can walk you through the process.\n\nWant to chat this week?",
      "delayDays": 5
    }
  ]'::jsonb,
  'post-quote',
  ARRAY['follow-up', 'quote', 'post-quote'],
  true
);

-- Template 9: Re-Engagement / No-Response
insert into public.templates_campaigns (title, description, steps, category, tags, is_global)
values (
  'Re-Engagement / No-Response',
  'Simple 3-step polite nudge. Still need help? Want us to take a quick look?',
  '[
    {
      "stepNumber": 1,
      "subject": "Still need help with your roof?",
      "body": "Just checking in — still need help with your roof?\n\nWe''re in {{city}} this week if you want us to take a quick look.\n\nNo pressure, just want to make sure you''re covered.",
      "delayDays": 7
    },
    {
      "stepNumber": 2,
      "subject": "Want us to take a quick look this week?",
      "body": "We''re still in {{city}} this week.\n\nWant us to take a quick look at your roof? No cost, no obligation — just want to make sure everything''s good.\n\nCan stop by tomorrow afternoon if you want.",
      "delayDays": 5
    },
    {
      "stepNumber": 3,
      "subject": "Just a friendly check-in",
      "body": "Just a friendly check-in — still need help?\n\nWe''re here if you want us to take a look. No pressure at all.\n\nHappy to help if you need it.",
      "delayDays": 7
    }
  ]'::jsonb,
  're-engagement',
  ARRAY['re-engagement', 'no-response', 'nudge'],
  true
);

-- ============================================================================
-- 6. SEED SNIPPETS
-- ============================================================================

-- Local Proof Snippets
insert into public.templates_snippets (category, body, is_global)
values
  ('local_proof', 'We just finished two roofs on {{street}}.', true),
  ('local_proof', 'Your area got hit hardest last week.', true),
  ('local_proof', 'We''re in {{city}} today if you want us to stop by.', true),
  ('local_proof', 'We''re already working with a few homeowners near {{city}} this week.', true);

-- Insurance Support Snippets
insert into public.templates_snippets (category, body, is_global)
values
  ('insurance_support', 'We help homeowners with documentation.', true),
  ('insurance_support', 'We meet with your adjuster at no cost.', true),
  ('insurance_support', 'We document everything your adjuster needs: photos, measurements, damage reports.', true),
  ('insurance_support', 'We''ve helped over 30 homeowners file successful claims.', true);

-- Soft CTA Snippets
insert into public.templates_snippets (category, body, is_global)
values
  ('soft_cta', 'Want me to take a quick look?', true),
  ('soft_cta', 'Can stop by tomorrow afternoon?', true),
  ('soft_cta', 'Want us to take a quick look this week?', true),
  ('soft_cta', 'Happy to take a look if you want.', true);

-- Social Proof Snippets
insert into public.templates_snippets (category, body, is_global)
values
  ('social_proof', 'We''ve helped over 30 homeowners after this storm.', true),
  ('social_proof', 'Most roofs we inspected had hidden bruising.', true),
  ('social_proof', 'We just finished two roofs on {{street}}.', true),
  ('social_proof', 'We''re already working with a few homeowners near {{city}} this week.', true);

-- Urgency / Storm Damage Snippets
insert into public.templates_snippets (category, body, is_global)
values
  ('urgency_storm', 'Hail damage isn''t visible from the ground.', true),
  ('urgency_storm', 'Wind lifted shingles in most neighborhoods around {{city}}.', true),
  ('urgency_storm', 'Most people don''t notice issues until they see leaks or missing shingles.', true),
  ('urgency_storm', 'Storm damage often includes lifted shingles, damaged flashing, and water intrusion points.', true);





























































