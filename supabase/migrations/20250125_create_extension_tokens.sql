-- Create extension_tokens table for storing revocable API tokens
create table if not exists public.extension_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token_hash text not null,          -- store SHA-256 hash, not the raw token
  created_at timestamptz default now(),
  last_used_at timestamptz,
  revoked boolean default false,
  expires_at timestamptz default (now() + interval '180 days')
);

-- Create indexes for performance
create index if not exists idx_ext_tokens_user on public.extension_tokens(user_id);
create index if not exists idx_ext_tokens_hash on public.extension_tokens(token_hash);

-- Add RLS policies
alter table public.extension_tokens enable row level security;

-- Users can only see their own tokens
create policy "Users can view own extension tokens" on public.extension_tokens
  for select using (auth.uid() = user_id);

-- Users can insert their own tokens
create policy "Users can insert own extension tokens" on public.extension_tokens
  for insert with check (auth.uid() = user_id);

-- Users can update their own tokens (for revoking)
create policy "Users can update own extension tokens" on public.extension_tokens
  for update using (auth.uid() = user_id);

-- Service role can access all tokens (for API authentication)
create policy "Service role can access all extension tokens" on public.extension_tokens
  for all using (auth.role() = 'service_role'); 