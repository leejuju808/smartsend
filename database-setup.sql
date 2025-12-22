-- Enrollments queue (run once)
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  step_no int not null default 1,
  status text not null default 'active', -- active|paused|completed|error
  next_send_at timestamptz,
  last_sent_at timestamptz,
  error_text text,
  created_at timestamptz not null default now(),
  unique(owner, sequence_id, lead_id)
);
create index if not exists idx_enrollments_due on public.enrollments(status, next_send_at);
create index if not exists idx_enrollments_owner_seq on public.enrollments(owner, sequence_id);

-- SmartSend Database Setup
-- Run this in your Supabase SQL editor

-- Users table (extends Supabase auth.users)
-- Commented out since users table already exists in Supabase
-- CREATE TABLE public.users (
--   id UUID REFERENCES auth.users(id) PRIMARY KEY,
--   email TEXT NOT NULL,
--   subscription_status TEXT DEFAULT 'free',
--   stripe_customer_id TEXT,
--   email_credits INTEGER DEFAULT 5,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
--   updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- Email templates table
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  target_audience TEXT NOT NULL,
  product_service TEXT NOT NULL,
  tone TEXT NOT NULL,
  generated_emails TEXT NOT NULL,
  optimized_version TEXT,
  performance_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Writing Assistant: Template suggestions table
CREATE TABLE IF NOT EXISTS public.template_suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE CASCADE,
  suggestion TEXT NOT NULL,
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('subject', 'body', 'tone', 'personalization')),
  ai_score INTEGER CHECK (ai_score >= 0 AND ai_score <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted BOOLEAN DEFAULT FALSE
);

-- Create index for template suggestions
CREATE INDEX IF NOT EXISTS idx_template_suggestions_template_id ON public.template_suggestions(template_id);
CREATE INDEX IF NOT EXISTS idx_template_suggestions_accepted ON public.template_suggestions(accepted);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Marketplace Templates table
CREATE TABLE IF NOT EXISTS public.marketplace_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  is_paid BOOLEAN DEFAULT false,
  price_cents INTEGER DEFAULT 0,
  cover_url TEXT,
  published BOOLEAN DEFAULT false,
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'draft')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Template Ratings table
CREATE TABLE IF NOT EXISTS public.template_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.marketplace_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, user_id)
);

-- Template Installs table
CREATE TABLE IF NOT EXISTS public.template_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.marketplace_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  installed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, user_id)
);

-- Template Events table for analytics
CREATE TABLE IF NOT EXISTS public.template_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.marketplace_templates(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'install', 'copy', 'export')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Stats view with average rating + installs count
CREATE OR REPLACE VIEW public.v_templates_stats AS
  SELECT t.id,
         COUNT(DISTINCT i.id) AS installs_count,
         COALESCE(AVG(r.stars), 0) AS avg_rating,
         COUNT(r.id) AS rating_count
  FROM public.marketplace_templates t
  LEFT JOIN public.template_installs i ON i.template_id = t.id
  LEFT JOIN public.template_ratings r ON r.template_id = t.id
  GROUP BY t.id;

-- Public templates view with stats
CREATE OR REPLACE VIEW public.v_templates_public AS
  SELECT t.*,
         s.installs_count,
         s.avg_rating,
         s.rating_count
  FROM public.marketplace_templates t
  LEFT JOIN public.v_templates_stats s ON s.id = t.id
  WHERE t.published = true AND t.visibility = 'public';

-- Trending view for last 7 days
CREATE OR REPLACE VIEW public.v_template_trending_7d AS
  WITH w AS (
    SELECT NOW() - INTERVAL '7 days' AS since
  )
  SELECT t.id AS template_id,
         t.title,
         t.cover_url,
         t.is_paid,
         t.price_cents,
         t.category,
         -- last 7d event counts
         COUNT(e.id) FILTER (WHERE e.event_type = 'view' AND e.created_at >= (SELECT since FROM w)) AS views_7d,
         COUNT(e.id) FILTER (WHERE e.event_type = 'install' AND e.created_at >= (SELECT since FROM w)) AS installs_7d,
         COUNT(e.id) FILTER (WHERE e.event_type = 'copy' AND e.created_at >= (SELECT since FROM w)) AS copies_7d,
         COUNT(e.id) FILTER (WHERE e.event_type = 'export' AND e.created_at >= (SELECT since FROM w)) AS exports_7d,
         -- simple score favoring intentful actions
         (3 * COUNT(e.id) FILTER (WHERE e.event_type = 'install' AND e.created_at >= (SELECT since FROM w))
          + 2 * COUNT(e.id) FILTER (WHERE e.event_type = 'copy' AND e.created_at >= (SELECT since FROM w))
          + 1 * COUNT(e.id) FILTER (WHERE e.event_type = 'view' AND e.created_at >= (SELECT since FROM w))
         )::INT AS trend_score
  FROM public.marketplace_templates t
  LEFT JOIN public.template_events e ON e.template_id = t.id
  WHERE t.published = true
  GROUP BY t.id, t.title, t.cover_url, t.is_paid, t.price_cents, t.category;

-- Enable Row Level Security
-- ALTER TABLE public.users ENABLE ROW LEVEL SECURITY; -- Commented out since users table already has RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid duplicate-name errors
DROP POLICY IF EXISTS "Users can view own email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;

-- Create policies
-- Commented out since users table already has policies
-- CREATE POLICY "Users can view own profile" ON public.users
--   FOR SELECT USING (auth.uid() = id);

-- CREATE POLICY "Users can update own profile" ON public.users
--   FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own email templates" ON public.email_templates
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- Marketplace templates policies
CREATE POLICY "marketplace_templates_select_public" ON public.marketplace_templates
  FOR SELECT USING (visibility = 'public' AND published = true);

CREATE POLICY "marketplace_templates_select_owner" ON public.marketplace_templates
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "marketplace_templates_insert_owner" ON public.marketplace_templates
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "marketplace_templates_update_owner" ON public.marketplace_templates
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "marketplace_templates_delete_owner" ON public.marketplace_templates
  FOR DELETE USING (auth.uid() = owner_id);

-- Ratings policies
CREATE POLICY "ratings_select_public" ON public.template_ratings
  FOR SELECT USING (true);

CREATE POLICY "ratings_insert_self" ON public.template_ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ratings_update_self" ON public.template_ratings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "ratings_delete_self" ON public.template_ratings
  FOR DELETE USING (auth.uid() = user_id);

-- Installs policies
CREATE POLICY "installs_select_public" ON public.template_installs
  FOR SELECT USING (true);

CREATE POLICY "installs_insert_self" ON public.template_installs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Events policies
CREATE POLICY "events_select_public" ON public.template_events
  FOR SELECT USING (true);

CREATE POLICY "events_insert_self" ON public.template_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Ensure required columns exist on users table for Stripe mapping
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger (if any) before (re)creating
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user(); 

-- Profiles table and policies (idempotent)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Ensure subscription_status column exists on profiles for gating
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free';

-- Ensure stripe_customer_id exists for Stripe mapping
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Add Stripe-related columns to profiles table
alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text default 'free',
  add column if not exists subscription_current_period_end timestamptz;

-- Create index for faster lookups
create index if not exists idx_profiles_stripe_customer on public.profiles (stripe_customer_id);

-- Helpful index on primary key (idempotent; primary key already indexed, but keep per instructions)
CREATE INDEX IF NOT EXISTS idx_profiles_user ON public.profiles (id);

DROP POLICY IF EXISTS "profiles are readable by owner" ON public.profiles;
DROP POLICY IF EXISTS "profiles are insertable by owner" ON public.profiles;
DROP POLICY IF EXISTS "profiles are updatable by owner" ON public.profiles;

CREATE POLICY "profiles are readable by owner"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles are insertable by owner"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles are updatable by owner"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Separate function and trigger for profiles to avoid clobbering the existing user trigger
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

-- Outbound message registry for tracking opens/replies
create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  step_no int not null,
  message_id text unique,
  pixel_token text unique,
  sent_at timestamptz,
  open_first_at timestamptz,
  open_count int not null default 0,
  replied boolean not null default false,
  reply_message_id text,
  reply_at timestamptz
);
create index if not exists idx_outbound_owner_lead_seq on public.outbound_messages(owner, lead_id, sequence_id);

-- (Optional) fast aggregate for dashboard cards
create or replace function public.metrics_for_sequence(p_owner uuid, p_sequence uuid)
returns table(sent bigint, open bigint, reply bigint)
language sql stable as $$
  select
    count(*)::bigint as sent,
    count(*) filter (where open_count > 0)::bigint as open,
    count(*) filter (where replied)       ::bigint as reply
  from public.outbound_messages
  where owner = p_owner and sequence_id = p_sequence;
$$;

-- Reply detection add-ons (idempotent)
alter table public.outbound_messages
  add column if not exists reply_gmail_id text,
  add column if not exists reply_received_at timestamptz;

create index if not exists idx_om_owner_lead_replied on public.outbound_messages(owner, lead_id, replied);

-- Lead-level reply timestamp for quick checks
alter table public.leads
  add column if not exists last_replied_at timestamptz;

-- Mailbox: track last poll time for replies
alter table public.mailboxes
  add column if not exists last_reply_check_at timestamptz;
 
-- Lead timezone support
alter table public.leads
  add column if not exists unsubscribed boolean not null default false,
  add column if not exists unsubscribed_at timestamptz;
create index if not exists idx_leads_owner_unsub on public.leads(owner, unsubscribed);

-- Per-message tracking columns
alter table public.outbound_messages
  add column if not exists tracking_key text unique,
  add column if not exists first_open_at timestamptz,
  add column if not exists click_count int not null default 0;
create index if not exists idx_om_tracking_key on public.outbound_messages(tracking_key);

-- Backfill first_open_at from open_first_at for compatibility
update public.outbound_messages set first_open_at = open_first_at where first_open_at is null and open_first_at is not null;

-- Ensure open_count exists (some environments may already have it)
alter table public.outbound_messages
  add column if not exists open_count int not null default 0;

-- Optional RPC for atomic increments (idempotent if exists)
create or replace function public.increment_open_count(p_key text)
returns void language sql as $$
  update public.outbound_messages set open_count = open_count + 1 where tracking_key = p_key;
$$;

-- Simple SQL RPC passthrough helper (if not present)
-- create or replace function public.sql(q text, args jsonb default '[]'::jsonb)
-- returns void language plpgsql as $$ begin execute format(q) using args; end; $$;

-- END tracking schema additions
 
-- Lead timezone support
alter table public.leads
  add column if not exists tz text;
create index if not exists idx_leads_owner_email_tz on public.leads(owner_email, tz);

-- Stop-on-reply behavior on each sequence
alter table public.sequences
  add column if not exists stop_on_reply boolean not null default true;

-- Per-step metrics for a sequence
create or replace function public.metrics_for_sequence_steps(p_owner uuid, p_sequence uuid)
returns table(step_no int, sent bigint, open bigint, reply bigint)
language sql stable as $$
  select
    step_no,
    count(*)::bigint as sent,
    count(*) filter (where open_count > 0)::bigint as open,
    count(*) filter (where replied)::bigint as reply
  from public.outbound_messages
  where owner = p_owner and sequence_id = p_sequence
  group by step_no
  order by step_no asc;
$$;

-- Connected accounts for Gmail/Outlook OAuth (idempotent)
create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text check (provider in ('gmail','outlook')),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

alter table public.connected_accounts enable row level security;

drop policy if exists "Users can manage own connected accounts" on public.connected_accounts;
create policy "Users can manage own connected accounts"
  on public.connected_accounts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Contacts and Suppression List Setup
-- Run this in Supabase SQL editor:

-- 1) Contacts table
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                      -- owner (from your auth.users.id)
  email text not null,
  first_name text,
  last_name text,
  company text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enforce uniqueness per user
create unique index if not exists contacts_user_email_unique
on public.contacts (user_id, lower(email));

-- 2) Suppression (global per user: don't email these)
create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  reason text,                    -- e.g. "unsubscribed", "bounced", "complaint"
  created_at timestamptz default now()
);

create unique index if not exists suppression_user_email_unique
on public.suppression_list (user_id, lower(email));

-- 3) RLS (optional – if you're using RLS)
alter table public.contacts enable row level security;
alter table public.suppression_list enable row level security;

create policy if not exists "contacts_owner_rw"
on public.contacts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "suppression_owner_rw"
on public.suppression_list
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 4) updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_contacts_touch on public.contacts;
create trigger trg_contacts_touch
before update on public.contacts
for each row execute function public.touch_updated_at();

-- A/B Testing Tables
create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null,      -- e.g. "upgrade_banner"
  variants jsonb not null, -- [{key:'A',weight:0.5},{key:'B',weight:0.5}]
  created_at timestamptz default now()
);

create table if not exists public.experiment_assignments (
  user_id uuid not null,
  experiment_id uuid not null,
  variant text not null,
  assigned_at timestamptz default now(),
  primary key (user_id, experiment_id)
);

create table if not exists public.experiment_events (
  user_id uuid,
  experiment_id uuid,
  variant text,
  event text,              -- 'viewed_banner', 'clicked_cta', 'converted'
  created_at timestamptz default now()
);

-- Create indexes for performance
create index if not exists idx_experiments_name on public.experiments(name);
create index if not exists idx_experiment_assignments_user on public.experiment_assignments(user_id);
create index if not exists idx_experiment_assignments_experiment on public.experiment_assignments(experiment_id);
create index if not exists idx_experiment_events_experiment on public.experiment_events(experiment_id);
create index if not exists idx_experiment_events_user on public.experiment_events(user_id);
create index if not exists idx_experiment_events_created on public.experiment_events(created_at);

-- Enable RLS
alter table public.experiments enable row level security;
alter table public.experiment_assignments enable row level security;
alter table public.experiment_events enable row level security;

-- RLS Policies (admin only for experiments, users can see their own assignments and events)
create policy "Admin can manage experiments" on public.experiments for all using (auth.uid() in (select id from public.profiles where subscription_status = 'pro' and email like '%@smartsend.ai'));
create policy "Users can view their own experiment assignments" on public.experiment_assignments for select using (auth.uid() = user_id);
create policy "Users can view their own experiment events" on public.experiment_events for select using (auth.uid() = user_id);

-- Click Actions System Setup
-- Add this section to enable dynamic click-based automation

-- Create click_actions table for dynamic click-based automation
create table if not exists public.click_actions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  match_url text not null,
  action text not null,   -- tag|followup_campaign|suppress
  value text,             -- e.g. tag name, campaign_id to start
  created_at timestamptz default now()
);

create index if not exists ca_campaign_idx on public.click_actions (campaign_id);

-- Add tags column to contacts table if not exists
alter table public.contacts add column if not exists tags jsonb default '[]'::jsonb;

-- Create helper RPC function for adding tags to contacts
create or replace function public.add_contact_tag(p_email text, p_tag text)
returns void as $$
begin
  update public.contacts
  set tags = case
    when not (tags ? p_tag) then tags || to_jsonb(array[p_tag])
    else tags
  end
  where lower(email) = lower(p_email);
end;
$$ language plpgsql;

-- Enable RLS on click_actions
alter table public.click_actions enable row level security;

-- Create policy for click_actions (users can only see/modify their own)
create policy "click_actions_own" on public.click_actions
  for all using (
    exists (
      select 1 from public.campaigns c
      where c.id = click_actions.campaign_id and c.user_id = auth.uid()
    )
  );

-- Enable pg_trgm for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_marketplace_templates_title_trgm ON public.marketplace_templates USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_marketplace_templates_description_trgm ON public.marketplace_templates USING GIN (description gin_trgm_ops);