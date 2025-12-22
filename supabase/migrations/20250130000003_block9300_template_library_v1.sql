-- =========================================================
-- Block 9300 — Template Library v1
-- (Pre-Written Roofing Campaigns + Snippets + Personalization Engine Inputs)
-- =========================================================

-- A. Create template_type enum
create type template_type as enum (
  'campaign',   -- full automated sequences
  'email',      -- individual full emails
  'snippet'     -- small reusable chunks
);

-- B. Create template_library table (Master templates - read-only for users)
create table if not exists public.template_library (
  id uuid primary key default gen_random_uuid(),
  template_type template_type not null,
  category text not null,           -- roofing / storm_damage / tune_up etc
  name text not null,               -- "Storm Damage – Email #1"
  subject text,
  body text not null,
  placeholders text[],              -- ["{homeowner_name}", "{city}", "{service_area}", "{roof_type}"]
  created_at timestamptz default now()
);

-- C. Create campaign_templates table (Copied into each campaign - user editable)
create table if not exists public.campaign_templates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text,
  subject text,
  body text,
  sequence_order int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- D. Create snippet_library table (Dynamic inserts)
create table if not exists public.snippet_library (
  id uuid primary key default gen_random_uuid(),
  category text not null,           -- "weather", "urgency", "closing", "value_prop"
  content text not null,
  placeholders text[]
);

-- E. Indexes
create index if not exists idx_template_library_type_category on public.template_library(template_type, category);
create index if not exists idx_template_library_category on public.template_library(category);
create index if not exists idx_campaign_templates_campaign on public.campaign_templates(campaign_id);
create index if not exists idx_campaign_templates_sequence on public.campaign_templates(campaign_id, sequence_order);
create index if not exists idx_snippet_library_category on public.snippet_library(category);

-- F. RLS Policies
alter table public.template_library enable row level security;
alter table public.campaign_templates enable row level security;
alter table public.snippet_library enable row level security;

-- template_library: read-only for all authenticated users
create policy "template_library_select_all" on public.template_library
  for select using (true);

-- campaign_templates: users can only access their own campaign templates
create policy "campaign_templates_select_own" on public.campaign_templates
  for select using (
    exists (
      select 1 from public.campaigns
      where campaigns.id = campaign_templates.campaign_id
      and campaigns.user_id = auth.uid()
    )
  );

create policy "campaign_templates_insert_own" on public.campaign_templates
  for insert with check (
    exists (
      select 1 from public.campaigns
      where campaigns.id = campaign_templates.campaign_id
      and campaigns.user_id = auth.uid()
    )
  );

create policy "campaign_templates_update_own" on public.campaign_templates
  for update using (
    exists (
      select 1 from public.campaigns
      where campaigns.id = campaign_templates.campaign_id
      and campaigns.user_id = auth.uid()
    )
  );

create policy "campaign_templates_delete_own" on public.campaign_templates
  for delete using (
    exists (
      select 1 from public.campaigns
      where campaigns.id = campaign_templates.campaign_id
      and campaigns.user_id = auth.uid()
    )
  );

-- snippet_library: read-only for all authenticated users
create policy "snippet_library_select_all" on public.snippet_library
  for select using (true);

-- G. Trigger to update updated_at for campaign_templates
create or replace function public.update_campaign_templates_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_campaign_templates_updated_at on public.campaign_templates;
create trigger trg_campaign_templates_updated_at
  before update on public.campaign_templates
  for each row execute function public.update_campaign_templates_updated_at();

-- H. Pre-load Roofing Templates (V1 Library)

-- Recipe 1 — Storm Damage Campaign
do $$
declare
  storm_email1_id uuid;
  storm_email2_id uuid;
  storm_email3_id uuid;
begin
  -- Email #1 — "Free Roof Check After Recent Storm"
  insert into public.template_library (template_type, category, name, subject, body, placeholders)
  values (
    'email',
    'storm_damage',
    'Storm Damage – Email #1',
    'Quick roof check after the recent storm',
    'Hi {homeowner_name},

This is {owner_name} with {company_name}.  
We''ve been helping homeowners here in {service_area} after the recent {recent_weather_event}.

If you''d like, I can come by for a quick roof check — no cost.

A lot of roofs look fine from the ground but have small damage that turns into leaks later.

Want me to stop by this week?',
    ARRAY['{homeowner_name}', '{owner_name}', '{company_name}', '{service_area}', '{recent_weather_event}']
  ) returning id into storm_email1_id;

  -- Email #2 — Follow-Up (2 days)
  insert into public.template_library (template_type, category, name, subject, body, placeholders)
  values (
    'email',
    'storm_damage',
    'Storm Damage – Email #2',
    'Circling back on roof check',
    'Hi {homeowner_name}, just circling back.

We''ve been finding hidden shingle damage all over {city} after the storm.

If you want a quick look, I''m happy to check your roof.',
    ARRAY['{homeowner_name}', '{city}']
  ) returning id into storm_email2_id;

  -- Email #3 — Last Check-In (5–7 days)
  insert into public.template_library (template_type, category, name, subject, body, placeholders)
  values (
    'email',
    'storm_damage',
    'Storm Damage – Email #3',
    'Last call for roof inspection',
    'Just wanted to offer one final time — if you want a quick inspection before the next rain, let me know and I''ll swing by.',
    ARRAY[]
  ) returning id into storm_email3_id;

end $$;

-- Create campaign template linking these emails (after emails are inserted)
insert into public.template_library (template_type, category, name, subject, body, placeholders)
select 
  'campaign',
  'storm_damage',
  'Storm Damage Campaign',
  'Storm Damage Outreach Sequence',
  'A 3-email sequence for reaching out to homeowners after storms.',
  ARRAY['{homeowner_name}', '{owner_name}', '{company_name}', '{service_area}', '{recent_weather_event}', '{city}']
where not exists (
  select 1 from public.template_library 
  where template_type = 'campaign' 
  and category = 'storm_damage' 
  and name = 'Storm Damage Campaign'
);

-- Recipe 2 — Roof Tune-Up + Maintenance
do $$
begin
  -- Email #1 — "Prevent Leaks Before the Season Changes"
  insert into public.template_library (template_type, category, name, subject, body, placeholders)
  values (
    'email',
    'tune_up',
    'Tune-Up – Email #1',
    'Prevent leaks before the season changes',
    'Hi {homeowner_name},

This is {owner_name} with {company_name}.

As we head into {season}, it''s a good time to catch small roof issues before they become expensive leaks.

We''re offering quick roof + gutter tune-ups in {service_area} this month.

Want me to swing by for a free inspection?',
    ARRAY['{homeowner_name}', '{owner_name}', '{company_name}', '{season}', '{service_area}']
  );

  -- Email #2 — Urgency follow-up
  insert into public.template_library (template_type, category, name, subject, body, placeholders)
  values (
    'email',
    'tune_up',
    'Tune-Up – Email #2',
    'Small damage now becomes expensive leaks',
    'Hi {homeowner_name},

Small damage now becomes expensive leaks once the rains hit.

We''re still doing free inspections in {city} this week. Want me to check your roof?',
    ARRAY['{homeowner_name}', '{city}']
  );

  -- Email #3 — Closing the file note
  insert into public.template_library (template_type, category, name, subject, body, placeholders)
  values (
    'email',
    'tune_up',
    'Tune-Up – Email #3',
    'Last call for roof tune-up',
    'Just wanted to offer one final time — if you want a quick inspection, let me know.',
    ARRAY[]
  );

end $$;

-- Create campaign template (after emails are inserted)
insert into public.template_library (template_type, category, name, subject, body, placeholders)
select 
  'campaign',
  'tune_up',
  'Roof Tune-Up Campaign',
  'Maintenance & Tune-Up Sequence',
  'A 3-email sequence for roof maintenance and tune-ups.',
  ARRAY['{homeowner_name}', '{owner_name}', '{company_name}', '{season}', '{service_area}', '{city}']
where not exists (
  select 1 from public.template_library 
  where template_type = 'campaign' 
  and category = 'tune_up' 
  and name = 'Roof Tune-Up Campaign'
);

-- Recipe 3 — Gutter + Roof Bundle
do $$
begin
  -- Email #1 — "Quick gutter+roof inspection available"
  insert into public.template_library (template_type, category, name, subject, body, placeholders)
  values (
    'email',
    'gutter_roof',
    'Gutter + Roof – Email #1',
    'Quick gutter+roof inspection available',
    'Hi {homeowner_name},

This is {owner_name} with {company_name}.

Clogged gutters cause most roof leaks. We''re doing quick gutter + roof inspections in {service_area} this week.

Want me to stop by?',
    ARRAY['{homeowner_name}', '{owner_name}', '{company_name}', '{service_area}']
  );

  -- Email #2 — "Most tune-ups take 15 minutes"
  insert into public.template_library (template_type, category, name, subject, body, placeholders)
  values (
    'email',
    'gutter_roof',
    'Gutter + Roof – Email #2',
    'Most tune-ups take 15 minutes',
    'Hi {homeowner_name},

Most gutter + roof tune-ups take about 15 minutes.

We''re still available in {city} this week. Want me to swing by?',
    ARRAY['{homeowner_name}', '{city}']
  );

  -- Email #3 — "Last call — want me to pencil you in?"
  insert into public.template_library (template_type, category, name, subject, body, placeholders)
  values (
    'email',
    'gutter_roof',
    'Gutter + Roof – Email #3',
    'Last call — want me to pencil you in?',
    'Just wanted to offer one final time — if you want a quick inspection, let me know.',
    ARRAY[]
  );

end $$;

-- Create campaign template (after emails are inserted)
insert into public.template_library (template_type, category, name, subject, body, placeholders)
select 
  'campaign',
  'gutter_roof',
  'Gutter + Roof Bundle Campaign',
  'Gutter & Roof Bundle Sequence',
  'A 3-email sequence for gutter and roof bundle services.',
  ARRAY['{homeowner_name}', '{owner_name}', '{company_name}', '{service_area}', '{city}']
where not exists (
  select 1 from public.template_library 
  where template_type = 'campaign' 
  and category = 'gutter_roof' 
  and name = 'Gutter + Roof Bundle Campaign'
);

-- I. Pre-load Snippets (Dynamic Inserts)

-- Weather Snippets
insert into public.snippet_library (category, content, placeholders)
values
  ('weather', 'We''ve been getting calls all week after the {recent_weather_event}.', ARRAY['{recent_weather_event}']),
  ('weather', 'The recent {recent_weather_event} in {city} has been causing roof issues.', ARRAY['{recent_weather_event}', '{city}']),
  ('weather', 'After the storm last week, we''ve seen a lot of hidden damage.', ARRAY[]);

-- Urgency Snippets
insert into public.snippet_library (category, content, placeholders)
values
  ('urgency', 'Small damage now becomes expensive leaks once the rains hit.', ARRAY[]),
  ('urgency', 'Small issues now can turn into major problems during the next storm.', ARRAY[]),
  ('urgency', 'Catching problems early saves thousands in repairs later.', ARRAY[]);

-- Credibility Snippets
insert into public.snippet_library (category, content, placeholders)
values
  ('credibility', 'We''ve worked with over 120 homeowners in {city} this year.', ARRAY['{city}']),
  ('credibility', 'We''ve been serving {service_area} for over 10 years.', ARRAY['{service_area}']),
  ('credibility', 'Local, licensed, and insured roofing company.', ARRAY[]);

-- Value Prop Snippets
insert into public.snippet_library (category, content, placeholders)
values
  ('value_prop', 'Quick, no-pressure inspection. You get a report, no obligation.', ARRAY[]),
  ('value_prop', 'Free inspection with no strings attached.', ARRAY[]),
  ('value_prop', 'We''ll give you honest answers about your roof condition.', ARRAY[]);

-- Friendly Closer Snippets
insert into public.snippet_library (category, content, placeholders)
values
  ('closing', 'If you ever need anything, you can reply to me anytime.', ARRAY[]),
  ('closing', 'Feel free to reply with any questions.', ARRAY[]),
  ('closing', 'Looking forward to helping you out.', ARRAY[]);

-- Comments
comment on table public.template_library is 'Master template library - read-only templates shipped with the app';
comment on table public.campaign_templates is 'User-editable templates copied from template_library into campaigns';
comment on table public.snippet_library is 'Dynamic insert snippets for high personalization';
comment on column public.template_library.placeholders is 'Array of placeholder tokens like {homeowner_name}, {city}, etc.';
comment on column public.snippet_library.placeholders is 'Array of placeholder tokens used in this snippet';

