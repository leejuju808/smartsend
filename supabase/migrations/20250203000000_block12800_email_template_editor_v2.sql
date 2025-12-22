-- Block 12800: Email Template Editor v2
-- Variables Sidebar + Roofing Snippets + AI Rewrite + Step Library
-- This migration creates step_templates and roofing_snippets tables

-- ============================================================================
-- 1. STEP TEMPLATES TABLE
-- ============================================================================

create table if not exists public.step_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_step_templates_org on public.step_templates(org_id);
create index if not exists idx_step_templates_user on public.step_templates(user_id);
create index if not exists idx_step_templates_created on public.step_templates(created_at desc);

-- Updated_at trigger
create or replace function public.set_step_template_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_step_templates_updated_at
before update on public.step_templates
for each row
execute function public.set_step_template_updated_at();

-- ============================================================================
-- 2. ROOFING SNIPPETS TABLE (Static/Seed Data)
-- ============================================================================

create table if not exists public.roofing_snippets (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'hail_damage',
    'storm_activity',
    'insurance',
    'inspection_scheduling',
    'cta',
    'trust_authority',
    'roof_type_specific'
  )),
  name text not null,
  snippet text not null,
  description text,
  created_at timestamptz default now()
);

create index if not exists idx_roofing_snippets_category on public.roofing_snippets(category);

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================

alter table public.step_templates enable row level security;
alter table public.roofing_snippets enable row level security;

-- Helper function to check org membership
create or replace function public.is_org_member_for_templates(_org_id uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.org_members
    where org_id = _org_id and user_id = auth.uid()
  );
$$;

-- Step templates: Users can only access templates from their org
create policy "step_templates_select_own_org" on public.step_templates
  for select using (is_org_member_for_templates(org_id));

create policy "step_templates_insert_own_org" on public.step_templates
  for insert with check (
    is_org_member_for_templates(org_id) and user_id = auth.uid()
  );

create policy "step_templates_update_own" on public.step_templates
  for update using (
    is_org_member_for_templates(org_id) and user_id = auth.uid()
  );

create policy "step_templates_delete_own" on public.step_templates
  for delete using (
    is_org_member_for_templates(org_id) and user_id = auth.uid()
  );

-- Roofing snippets: Public read access for all authenticated users
create policy "roofing_snippets_select_all" on public.roofing_snippets
  for select to authenticated using (true);

-- Only admins can insert/update/delete roofing snippets (seed data management)
create policy "roofing_snippets_modify_admin" on public.roofing_snippets
  for all using (
    exists(
      select 1 from public.org_members om
      join public.organizations o on o.id = om.org_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin')
      limit 1
    )
  );

-- ============================================================================
-- 4. SEED ROOFING SNIPPETS
-- ============================================================================

-- Hail Damage
insert into public.roofing_snippets (category, name, snippet, description) values
('hail_damage', 'Hail Damage Intro', 'Hi {first_name}, I noticed your area in {city} had recent hail activity. Many homeowners are seeing shingle bruising or granule loss. We''re doing free inspections this week—want me to take a look at your roof?', 'Introduction mentioning recent hail activity'),
('hail_damage', 'Hail Damage Follow-up', 'Following up on the hail damage we discussed. Insurance companies often cover roof repairs from hail storms. Would you like me to help you file a claim?', 'Follow-up on hail damage and insurance'),
('hail_damage', 'Hail Damage CTA', 'Hail damage can worsen over time if not addressed. Let''s schedule a free inspection to assess the condition of your roof. Available this week?', 'Call-to-action for hail damage inspection');

-- Storm Activity
insert into public.roofing_snippets (category, name, snippet, description) values
('storm_activity', 'Recent Storm Reference', 'I saw {city} was hit by that recent storm. Many roofs in the area are showing signs of damage. Have you had yours checked yet?', 'Reference to recent storm activity'),
('storm_activity', 'Storm Damage Warning', 'Storm damage often isn''t visible from the ground. A professional inspection can catch issues before they become costly repairs.', 'Warning about hidden storm damage'),
('storm_activity', 'Storm Season Prep', 'With storm season approaching, now''s a good time to ensure your roof is in top condition. We offer free inspections to help you prepare.', 'Preparation for upcoming storms');

-- Insurance
insert into public.roofing_snippets (category, name, snippet, description) values
('insurance', 'Insurance Claim Assistance', 'Many homeowners don''t realize their insurance covers roof repairs from storm damage. I can help you navigate the claims process—no cost to you.', 'Offer to help with insurance claims'),
('insurance', 'Insurance Coverage Check', 'Have you checked if your insurance policy covers roof damage? Most policies cover storm-related repairs. Want me to review your situation?', 'Suggestion to check insurance coverage'),
('insurance', 'Insurance Claim CTA', 'If your roof has storm damage, your insurance may cover the full cost. Let''s schedule a free inspection to see if you qualify.', 'CTA for insurance-covered inspection');

-- Inspection Scheduling
insert into public.roofing_snippets (category, name, snippet, description) values
('inspection_scheduling', 'Free Inspection Offer', 'We''re offering free roof inspections in {city} this week. No obligation, just want to help homeowners understand their roof''s condition.', 'Free inspection offer'),
('inspection_scheduling', 'Inspection Scheduling', 'I''d love to take a look at your roof. Are you available this week for a quick inspection? It''s completely free and takes about 30 minutes.', 'Direct inspection scheduling request'),
('inspection_scheduling', 'Inspection Benefits', 'A professional inspection can identify issues early, saving you thousands in repairs down the line. Free this week if you''d like me to come by.', 'Benefits of inspection');

-- CTA
insert into public.roofing_snippets (category, name, snippet, description) values
('cta', 'Soft CTA', 'If you''re interested, I''d be happy to discuss your roof situation. No pressure, just here to help.', 'Soft call-to-action'),
('cta', 'Direct CTA', 'Ready to get your roof inspected? Reply here or call {phone} to schedule your free inspection.', 'Direct call-to-action with phone'),
('cta', 'Urgency CTA', 'Roof issues only get worse with time. Let''s address this now before it becomes a bigger problem. Available this week?', 'Urgency-based CTA');

-- Trust/Authority
insert into public.roofing_snippets (category, name, snippet, description) values
('trust_authority', 'License & Insurance', 'We''re fully licensed and insured, and we''ve helped hundreds of homeowners in {city} with their roofing needs.', 'License and insurance statement'),
('trust_authority', 'Local Experience', 'We''ve been serving {city} for years and understand the unique challenges roofs face in this area.', 'Local experience statement'),
('trust_authority', 'Customer Testimonials', 'Don''t just take my word for it—we have dozens of satisfied customers in {city} who can vouch for our work.', 'Reference to customer testimonials'),
('trust_authority', 'We''ve Helped Homes', 'We''ve helped homes in {city} with everything from minor repairs to full roof replacements. I''d love to help you too.', 'Reference to helping other homes');

-- Roof Type Specific
insert into public.roofing_snippets (category, name, snippet, description) values
('roof_type_specific', 'Asphalt Shingle Reference', 'I noticed your {roof_type_guess} roof. Asphalt shingles are particularly vulnerable to storm damage. Have you had it inspected recently?', 'Reference to asphalt shingle roofs'),
('roof_type_specific', 'Metal Roof Reference', 'Metal roofs are durable, but they can still suffer damage from severe weather. Let me check yours to ensure it''s in good shape.', 'Reference to metal roofs'),
('roof_type_specific', 'Tile Roof Reference', 'Tile roofs are beautiful but require special care. I specialize in tile roof maintenance and repairs.', 'Reference to tile roofs');

-- ============================================================================
-- 5. GRANTS
-- ============================================================================

grant select, insert, update, delete on public.step_templates to authenticated;
grant select on public.roofing_snippets to authenticated;




























































