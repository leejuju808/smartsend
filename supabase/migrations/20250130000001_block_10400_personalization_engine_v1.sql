-- Block 10400 — Smart Personalization Engine v1
-- Local References + Dynamic Openers + Roofing Context Injection

-- 1. Personalization cache table (optional but recommended for V1)
create table if not exists public.personalization_cache (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  step_id uuid references public.campaign_steps(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  opener text not null,
  local_reference text not null,
  roof_context text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Cache key: contact + step combination
  unique(contact_id, step_id)
);

create index if not exists idx_personalization_cache_contact_step 
  on public.personalization_cache(contact_id, step_id);
create index if not exists idx_personalization_cache_campaign 
  on public.personalization_cache(campaign_id);

-- Update trigger for updated_at
create or replace function update_personalization_cache_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_personalization_cache_updated_at
before update on public.personalization_cache
for each row
execute function update_personalization_cache_updated_at();

-- 2. Add personalization column to campaign_send_events (where we log sends)
alter table public.campaign_send_events
  add column if not exists personalization jsonb;

create index if not exists idx_campaign_send_events_personalization 
  on public.campaign_send_events using gin (personalization);

-- 3. Add personalization column to campaign_send_queue (for preview/audit)
alter table public.campaign_send_queue
  add column if not exists personalization jsonb;

create index if not exists idx_campaign_send_queue_personalization 
  on public.campaign_send_queue using gin (personalization);

-- 4. Enable RLS on personalization_cache
alter table public.personalization_cache enable row level security;

-- RLS: Users can read cache entries for their contacts/campaigns
create policy "personalization_cache_select_own"
  on public.personalization_cache
  for select
  using (
    exists (
      select 1 from public.contacts c
      where c.id = personalization_cache.contact_id
        and c.workspace_id in (
          select workspace_id from public.profiles p
          where p.id = auth.uid()
        )
    )
    or exists (
      select 1 from public.campaigns camp
      where camp.id = personalization_cache.campaign_id
        and (camp.workspace_id in (
          select workspace_id from public.profiles p
          where p.id = auth.uid()
        ))
    )
  );

-- Service role can do everything
create policy "personalization_cache_service_role"
  on public.personalization_cache
  for all
  to service_role
  using (true)
  with check (true);

-- 5. User preferences for personalization (Settings > Preferences)
create table if not exists public.personalization_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  tone text not null default 'direct' check (tone in ('friendly', 'direct', 'professional')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_personalization_settings_updated_at
before update on public.personalization_settings
for each row
execute function update_personalization_cache_updated_at();

alter table public.personalization_settings enable row level security;

create policy "personalization_settings_own"
  on public.personalization_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 6. Helper function to get contact data for personalization
create or replace function public.get_contact_personalization_data(p_contact_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'name', c.first_name,
    'city', coalesce((c.attrs->>'city'), null),
    'state', coalesce((c.attrs->>'state'), null),
    'zip', coalesce((c.attrs->>'zip'), null),
    'tags', c.tags
  )
  into result
  from public.contacts c
  where c.id = p_contact_id;
  
  return coalesce(result, '{}'::jsonb);
end;
$$;

grant execute on function public.get_contact_personalization_data(uuid) to service_role, authenticated;

