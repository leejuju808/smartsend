-- Email Templates Library
-- High-performing cold email templates for instant campaigns

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  category text not null,          -- e.g. 'SaaS', 'Agency', 'Recruiting'
  intent text not null,            -- 'Intro', 'Follow-up', 'Demo Offer'
  title text not null,
  body text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  is_public boolean default true
);

-- Indexes for performance
create index if not exists idx_email_templates_category on public.email_templates (category);
create index if not exists idx_email_templates_intent on public.email_templates (intent);
create index if not exists idx_email_templates_public on public.email_templates (is_public) where is_public = true;

-- RLS policies - allow public read for public templates
alter table public.email_templates enable row level security;

-- Anyone can read public templates
create policy if not exists "email_templates_select_public" on public.email_templates
  for select using (is_public = true);

-- Only authenticated users can create templates (admins/system)
create policy if not exists "email_templates_insert_authenticated" on public.email_templates
  for insert with check (auth.uid() is not null);

-- Seed with high-performing templates
insert into public.email_templates (category, intent, title, body, is_public)
values
  (
    'SaaS', 
    'Intro', 
    'AI Outreach Intro', 
    'Hey {{firstName}}, noticed your team uses {{tool}}. SmartSend helps automate your follow-ups with AI. Want me to send details?',
    true
  ),
  (
    'Agency', 
    'Follow-up', 
    'Checking in', 
    'Hey {{firstName}}, just following up on my last note — any interest in boosting your client outreach efficiency this week?',
    true
  ),
  (
    'Recruiting', 
    'Intro', 
    'Hiring Talent', 
    'Hi {{firstName}}, are you open to chatting about top remote candidates we''ve recently sourced?',
    true
  ),
  (
    'SaaS',
    'Demo Offer',
    'Quick Demo Offer',
    'Hi {{firstName}}, I see {{company}} is growing fast. SmartSend can automate your sales outreach and follow-ups. Free 10-min demo this week?',
    true
  ),
  (
    'Agency',
    'Intro',
    'Agency Outreach',
    'Hey {{firstName}}, noticed {{company}} is scaling. We help agencies automate client acquisition with AI-powered sequences. Worth a quick chat?',
    true
  ),
  (
    'SaaS',
    'Follow-up',
    'Value Proposition Follow-up',
    'Hi {{firstName}}, following up — SmartSend helps sales teams reply faster to prospects and book more meetings. Interested in seeing how it works?',
    true
  );

