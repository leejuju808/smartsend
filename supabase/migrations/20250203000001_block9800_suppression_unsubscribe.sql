-- Block 9800 — SmartSend Suppression & Unsubscribe Center v1 (Global DNC + 1-Click Unsubscribe)
-- Makes SmartSend safe + compliant by providing:
-- 1. A global suppression list (emails + domains)
-- 2. 1-click unsubscribe links in emails
-- 3. Auto-mark leads as do_not_contact
-- 4. A Suppression Center UI to review + add DNC entries
-- 5. Scheduler that never sends to suppressed contacts

-- 1) Global Suppression List
create table if not exists public.smartsend_suppressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  domain text,
  reason text,      -- 'unsubscribe' | 'manual' | 'bounce' | 'complaint' | etc.
  source text,      -- 'click' | 'reply' | 'manual' | 'import'
  created_at timestamptz default now(),
  constraint smartsend_suppressions_email_or_domain
    check ((email is not null) or (domain is not null)),
  unique (user_id, email),
  unique (user_id, domain)
);

create index if not exists idx_smartsend_suppressions_user_email 
  on public.smartsend_suppressions (user_id, email);

create index if not exists idx_smartsend_suppressions_user_domain 
  on public.smartsend_suppressions (user_id, domain);

create index if not exists idx_smartsend_suppressions_email 
  on public.smartsend_suppressions (email) 
  where email is not null;

create index if not exists idx_smartsend_suppressions_domain 
  on public.smartsend_suppressions (domain) 
  where domain is not null;

-- 2) Unsubscribe Tokens
-- Each lead/campaign pair gets a token we can put in links
create table if not exists public.smartsend_unsubscribe_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  token text not null,
  created_at timestamptz default now(),
  unique (token),
  unique (lead_id, campaign_id)
);

create index if not exists idx_smartsend_unsubscribe_tokens_token 
  on public.smartsend_unsubscribe_tokens (token);

create index if not exists idx_smartsend_unsubscribe_tokens_lead_campaign 
  on public.smartsend_unsubscribe_tokens (lead_id, campaign_id);

-- Enable RLS
alter table public.smartsend_suppressions enable row level security;
alter table public.smartsend_unsubscribe_tokens enable row level security;

-- RLS Policies for smartsend_suppressions
create policy "Users can view their own suppressions"
  on public.smartsend_suppressions
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own suppressions"
  on public.smartsend_suppressions
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own suppressions"
  on public.smartsend_suppressions
  for update
  using (auth.uid() = user_id);

-- RLS Policies for smartsend_unsubscribe_tokens
-- Public read access for unsubscribe tokens (needed for unsubscribe page)
create policy "Public can read unsubscribe tokens"
  on public.smartsend_unsubscribe_tokens
  for select
  using (true);

create policy "Service role can insert unsubscribe tokens"
  on public.smartsend_unsubscribe_tokens
  for insert
  with check (true);

-- Grant necessary permissions
grant select, insert, update on public.smartsend_suppressions to authenticated;
grant select, insert on public.smartsend_unsubscribe_tokens to authenticated;
grant select on public.smartsend_unsubscribe_tokens to anon; -- For unsubscribe page


































































