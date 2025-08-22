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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

-- Enable Row Level Security
-- ALTER TABLE public.users ENABLE ROW LEVEL SECURITY; -- Commented out since users table already has RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

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