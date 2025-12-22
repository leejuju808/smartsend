-- Block 454: SmartSend Public API v1
-- API Keys, Webhooks, Rate Limiting, and API Infrastructure

-- ============================================================================
-- 1. API KEYS TABLE (workspace-level)
-- ============================================================================

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null unique, -- Plaintext key (ss_live_... or ss_test_...)
  name text,
  created_at timestamptz default now(),
  last_used timestamptz,
  revoked_at timestamptz -- NULL = active, timestamp = revoked
);

create index if not exists idx_api_keys_workspace on public.api_keys(workspace_id);
create index if not exists idx_api_keys_key on public.api_keys(key) where revoked_at is null;
create index if not exists idx_api_keys_last_used on public.api_keys(last_used);

-- Helper function to generate API key
-- Note: This is a placeholder - actual key generation happens in application code
-- to ensure proper formatting and uniqueness

-- ============================================================================
-- 2. WEBHOOKS TABLE
-- ============================================================================

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  url text not null,
  event text not null check (event in (
    'lead.created',
    'lead.updated',
    'lead.replied',
    'lead.intent.changed',
    'email.sent',
    'email.open',
    'email.click',
    'email.reply',
    'email.bounce',
    'email.spam',
    'broadcast.completed',
    'campaign.completed'
  )),
  secret text not null default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz default now(),
  active boolean default true
);

create index if not exists idx_webhooks_workspace on public.webhooks(workspace_id);
create index if not exists idx_webhooks_event on public.webhooks(event, active) where active = true;

-- ============================================================================
-- 3. RATE LIMITING TABLE
-- ============================================================================

create table if not exists public.api_rate_limits (
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  window_start timestamptz not null,
  request_count int not null default 0,
  primary key (api_key_id, window_start)
);

create index if not exists idx_api_rate_limits_window on public.api_rate_limits(window_start);

-- Function to check and increment rate limit
create or replace function public.check_rate_limit(
  p_api_key_id uuid,
  p_limit_per_minute int default 60,
  p_limit_per_day int default 5000
)
returns boolean
language plpgsql
as $$
declare
  v_minute_window timestamptz := date_trunc('minute', now());
  v_day_window timestamptz := date_trunc('day', now());
  v_minute_count int;
  v_day_count int;
begin
  -- Get current counts
  select coalesce(sum(request_count), 0) into v_minute_count
  from public.api_rate_limits
  where api_key_id = p_api_key_id
    and window_start >= v_minute_window - interval '1 minute';
  
  select coalesce(sum(request_count), 0) into v_day_count
  from public.api_rate_limits
  where api_key_id = p_api_key_id
    and window_start >= v_day_window;
  
  -- Check limits
  if v_minute_count >= p_limit_per_minute or v_day_count >= p_limit_per_day then
    return false;
  end if;
  
  -- Increment counter
  insert into public.api_rate_limits (api_key_id, window_start, request_count)
  values (p_api_key_id, v_minute_window, 1)
  on conflict (api_key_id, window_start)
  do update set request_count = api_rate_limits.request_count + 1;
  
  return true;
end;
$$;

-- ============================================================================
-- 4. API USAGE LOG (for analytics)
-- ============================================================================

create table if not exists public.api_usage_log (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  endpoint text not null,
  method text not null,
  status_code int,
  created_at timestamptz default now()
);

create index if not exists idx_api_usage_log_api_key on public.api_usage_log(api_key_id, created_at);
create index if not exists idx_api_usage_log_workspace on public.api_usage_log(workspace_id, created_at);

-- ============================================================================
-- 5. RLS POLICIES
-- ============================================================================

alter table public.api_keys enable row level security;
alter table public.webhooks enable row level security;

-- API Keys: workspace members can view, owners/admins can manage
drop policy if exists "api_keys_select" on public.api_keys;
create policy "api_keys_select" on public.api_keys
  for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_members.workspace_id = api_keys.workspace_id
        and workspace_members.user_id = auth.uid()
    )
  );

drop policy if exists "api_keys_manage" on public.api_keys;
create policy "api_keys_manage" on public.api_keys
  for all
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_members.workspace_id = api_keys.workspace_id
        and workspace_members.user_id = auth.uid()
        and workspace_members.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_members.workspace_id = api_keys.workspace_id
        and workspace_members.user_id = auth.uid()
        and workspace_members.role in ('owner', 'admin')
    )
  );

-- Webhooks: workspace members can view, owners/admins can manage
drop policy if exists "webhooks_select" on public.webhooks;
create policy "webhooks_select" on public.webhooks
  for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_members.workspace_id = webhooks.workspace_id
        and workspace_members.user_id = auth.uid()
    )
  );

drop policy if exists "webhooks_manage" on public.webhooks;
create policy "webhooks_manage" on public.webhooks
  for all
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_members.workspace_id = webhooks.workspace_id
        and workspace_members.user_id = auth.uid()
        and workspace_members.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_members.workspace_id = webhooks.workspace_id
        and workspace_members.user_id = auth.uid()
        and workspace_members.role in ('owner', 'admin')
    )
  );

-- ============================================================================
-- 6. WEBHOOK SIGNATURE FUNCTION
-- ============================================================================

create or replace function public.sign_webhook_payload(
  p_payload jsonb,
  p_secret text
)
returns text
language plpgsql
as $$
declare
  v_payload_text text;
  v_signature text;
begin
  v_payload_text := p_payload::text;
  -- Use HMAC-SHA256 (PostgreSQL doesn't have built-in HMAC, so we'll do this in application code)
  -- This is a placeholder - actual signing happens in TypeScript
  return 'sha256=' || encode(digest(v_payload_text || p_secret, 'sha256'), 'hex');
end;
$$;

-- ============================================================================
-- 7. HELPER: Get API key by key string
-- ============================================================================

create or replace function public.get_api_key_info(p_key text)
returns table (
  id uuid,
  workspace_id uuid,
  name text,
  revoked_at timestamptz
)
language sql
stable
as $$
  select id, workspace_id, name, revoked_at
  from public.api_keys
  where key = p_key
    and revoked_at is null;
$$;

