-- Add meeting settings on profiles (idempotent)
alter table public.profiles
  add column if not exists calendly_url text,
  add column if not exists timezone text default 'America/Los_Angeles';

-- Ensure meetings table exists (from analytics; idempotent)
create table if not exists public.meetings (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  attendee_email text,
  source text default 'reply_intent',
  status text default 'scheduled',
  scheduled_at timestamptz,
  created_at timestamptz default now()
);
alter table public.meetings enable row level security;
create policy if not exists "own meetings" on public.meetings
  for all using (auth.uid() = profile_id);

-- Ensure messages has reply fields (idempotent)
alter table public.messages
  add column if not exists replied_at timestamptz,
  add column if not exists reply_intent text,         -- 'positive' | 'neutral' | 'negative'
  add column if not exists meeting_id uuid references public.meetings(id) on delete set null;

-- Helpful index
create index if not exists idx_messages_profile_replied on public.messages(profile_id, replied_at);
