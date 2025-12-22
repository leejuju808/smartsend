-- Block 21472 — SmartSend Roofing Cold Campaign Template Pack v1
-- Campaign Templates with JSONB emails structure for roofing cold email campaigns

-- Ensure campaign_templates table exists with the required structure
create table if not exists campaign_templates (
  id uuid primary key default gen_random_uuid(),
  niche text not null, -- "roofing"
  name text not null,  -- "Roofing — Hail Damage Check"
  description text,
  goal text not null,  -- "book_estimate" | "inspection" | "gutter_cleaning"
  emails jsonb not null, -- array of steps (subject, body, delay)
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Add emails column if table exists but column doesn't
do $$
begin
  if exists (select 1 from information_schema.tables 
             where table_schema = 'public' and table_name = 'campaign_templates') then
    if not exists (select 1 from information_schema.columns 
                   where table_schema = 'public' and table_name = 'campaign_templates' 
                   and column_name = 'emails') then
      alter table campaign_templates add column emails jsonb;
    end if;
    
    -- Ensure niche column exists
    if not exists (select 1 from information_schema.columns 
                   where table_schema = 'public' and table_name = 'campaign_templates' 
                   and column_name = 'niche') then
      alter table campaign_templates add column niche text;
    end if;
    
    -- Ensure goal column exists
    if not exists (select 1 from information_schema.columns 
                   where table_schema = 'public' and table_name = 'campaign_templates' 
                   and column_name = 'goal') then
      alter table campaign_templates add column goal text;
    end if;
    
    -- Ensure is_active column exists
    if not exists (select 1 from information_schema.columns 
                   where table_schema = 'public' and table_name = 'campaign_templates' 
                   and column_name = 'is_active') then
      alter table campaign_templates add column is_active boolean default true;
    end if;
  end if;
end $$;

-- Create index for niche and goal lookups
create index if not exists campaign_templates_niche_idx
  on campaign_templates (niche, goal);

-- Enable RLS if not already enabled
alter table campaign_templates enable row level security;

-- RLS policies: allow authenticated users to read active templates
drop policy if exists "campaign_templates_select_authenticated" on campaign_templates;
create policy "campaign_templates_select_authenticated" on campaign_templates
  for select
  to authenticated
  using (is_active = true);

-- Allow service role full access for seeding
drop policy if exists "campaign_templates_service_role_all" on campaign_templates;
create policy "campaign_templates_service_role_all" on campaign_templates
  for all
  to service_role
  using (true)
  with check (true);

-- Seed Data: 3 Roofing Campaign Packs
-- Use DO block to handle potential duplicates gracefully

do $$
begin
  -- Campaign 1 — "Storm & Hail Roof Check"
  if not exists (
    select 1 from campaign_templates 
    where niche = 'roofing' and name = 'Storm & Hail Roof Check'
  ) then
    insert into campaign_templates (niche, name, description, goal, emails)
    values (
      'roofing',
      'Storm & Hail Roof Check',
      'Cold email sequence offering quick post-storm roof inspections for homeowners.',
      'book_estimate',
      '[
        {
          "step": 1,
          "delay_days": 0,
          "subject": "{{homeowner_first_name}}, quick roof check after the storms?",
          "body": "Hi {{homeowner_first_name}},\\n\\nI''m {{sender_name}} with {{company_name}} here in {{city}}. After the recent storms, we''ve been finding hidden shingle damage and small leaks on a lot of roofs in your area.\\n\\nWe''re offering a quick, no-pressure roof check for homeowners on your street. It usually takes 20–30 minutes and you''ll get photos of anything we find.\\n\\nWould you like to grab a spot this week? You can pick a time here: {{booking_link}}\\n\\nIf everything looks good, we''ll simply say so. If not, at least you''ll know before it turns into a bigger problem.\\n\\n– {{sender_name}}, {{company_name}}"
        },
        {
          "step": 2,
          "delay_days": 3,
          "subject": "Still offering free roof checks in {{city}}",
          "body": "Hi {{homeowner_first_name}},\\n\\nJust circling back in case you missed my last note. We''re still doing quick roof checks in {{city}} after the recent weather.\\n\\nNo sales pressure – just photos, a short summary, and an honest opinion. If everything looks fine, you''ll have peace of mind.\\n\\nWould you like me to reserve a slot for you this week or next?\\n\\nYou can grab a time here: {{booking_link}}\\n\\nThanks,\\n{{sender_name}}"
        },
        {
          "step": 3,
          "delay_days": 6,
          "subject": "Last call: roof check before rainy season hits",
          "body": "Hi {{homeowner_first_name}},\\n\\nLast quick note from me on this. We''re wrapping up our post-storm roof checks in {{city}}. A lot of homeowners are catching small issues before the heavier rain hits.\\n\\nIf you''d like one of the last spots, here''s the link to book: {{booking_link}}\\n\\nIf you''re all set, no worries at all – just wanted to make sure you had the option.\\n\\n– {{sender_name}}"
        }
      ]'::jsonb
    );
  end if;

  -- Campaign 2 — "Aging Roof Replacement"
  if not exists (
    select 1 from campaign_templates 
    where niche = 'roofing' and name = 'Aging Roof Replacement'
  ) then
    insert into campaign_templates (niche, name, description, goal, emails)
    values (
      'roofing',
      'Aging Roof Replacement',
      'Sequence for older roofs approaching end of life, focused on planning ahead and financing options.',
      'book_estimate',
      '[
        {
          "step": 1,
          "delay_days": 0,
          "subject": "{{homeowner_first_name}}, planning ahead for your roof?",
          "body": "Hi {{homeowner_first_name}},\\n\\nI''m {{sender_name}} with {{company_name}} here in {{city}}. We specialize in helping homeowners with roofs in the 15–25 year range plan their replacement before leaks and emergency costs hit.\\n\\nWe typically walk the roof, check the attic, and then give you a clear written estimate with options – including simple monthly payment plans if you prefer to finance.\\n\\nWould you like a no-obligation estimate so you know what to expect ahead of time? You can grab a time here: {{booking_link}}\\n\\n– {{sender_name}}, {{company_name}}"
        },
        {
          "step": 2,
          "delay_days": 4,
          "subject": "Roof replacement estimate (no rush, just clarity)",
          "body": "Hi {{homeowner_first_name}},\\n\\nMost of the homeowners we talk to aren''t in a rush – they just don''t want to be surprised by a big roof expense.\\n\\nIf your roof is getting older, a simple inspection + written estimate can give you a clear number to plan around, whether you replace it this year or later.\\n\\nIf you''d like that information, you can choose a time that fits here: {{booking_link}}\\n\\nIf you''re already working with another roofer, just let me know and I''ll close your file.\\n\\n– {{sender_name}}"
        },
        {
          "step": 3,
          "delay_days": 7,
          "subject": "Should I close your file, {{homeowner_first_name}}?",
          "body": "Hi {{homeowner_first_name}},\\n\\nI haven''t heard back, so I wanted to quickly check in. I can either:\\n\\n1) Schedule a quick visit to give you a clear roof replacement estimate, or\\n2) Close your file and not follow up again.\\n\\nWhich would you prefer? A quick reply with \"1\" or \"2\" is perfect.\\n\\n– {{sender_name}}"
        }
      ]'::jsonb
    );
  end if;

  -- Campaign 3 — "Gutter & Small Repair Feeder"
  if not exists (
    select 1 from campaign_templates 
    where niche = 'roofing' and name = 'Gutter & Small Repair Feeder'
  ) then
    insert into campaign_templates (niche, name, description, goal, emails)
    values (
      'roofing',
      'Gutter & Small Repair Feeder',
      'Short campaign offering quick gutter cleaning and minor roof fixes to start the relationship.',
      'inspection',
      '[
        {
          "step": 1,
          "delay_days": 0,
          "subject": "Quick gutter clean + minor roof fixes in {{city}}",
          "body": "Hi {{homeowner_first_name}},\\n\\nThis is {{sender_name}} with {{company_name}}. We''re doing a run of simple gutter clean-outs and small roof repairs in {{city}} this week.\\n\\nIf your gutters are overflowing or you have a small leak / missing shingles, we can usually take care of it in a single visit and keep your roof in good shape.\\n\\nWould you like to see our next available times? You can book here: {{booking_link}}\\n\\n– {{sender_name}}"
        },
        {
          "step": 2,
          "delay_days": 3,
          "subject": "Still need gutters cleared or a small leak checked?",
          "body": "Hi {{homeowner_first_name}},\\n\\nQuick follow up here – we still have a few openings for gutter cleaning and small repairs in {{city}}.\\n\\nOften, fixing small issues early prevents bigger roof problems later. We can also give you a quick overall roof check while we''re there.\\n\\nIf you want to grab one of the remaining slots, here''s the link: {{booking_link}}\\n\\nThanks,\\n{{sender_name}}"
        },
        {
          "step": 3,
          "delay_days": 6,
          "subject": "Last openings this month for small roof work",
          "body": "Hi {{homeowner_first_name}},\\n\\nWe''re closing out our schedule for small jobs this month in {{city}}. If you''ve been meaning to get the gutters cleared or a small issue checked, this is probably the best time.\\n\\nHere''s the booking link one more time: {{booking_link}}\\n\\nIf you don''t need anything right now, no problem at all – you''ll still see us around the neighborhood.\\n\\n– {{sender_name}}"
        }
      ]'::jsonb
    );
  end if;
end $$;

