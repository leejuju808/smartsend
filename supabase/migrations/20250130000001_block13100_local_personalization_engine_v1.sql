-- =========================================================
-- Block 13100 — SmartSend Local Personalization Engine v1
-- (The System That Automatically Adds City, Weather & Neighborhood Context to Boost Roofing Replies)
-- =========================================================

-- Table to cache local context data (weather, storms, etc.) for performance
create table if not exists public.local_context (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  state text,
  zip text,
  -- Weather data (cached for 24 hours)
  last_weather jsonb default '{}'::jsonb, -- {events: [], conditions: {}, wind_speed: null, precipitation: null}
  storm_flag boolean default false, -- true if recent storm detected
  storm_type text, -- 'hail' | 'wind' | 'rain' | 'snow' | 'hurricane'
  storm_date date, -- date of most recent storm
  -- Neighborhood data
  neighborhood text,
  -- Cache metadata
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

-- Unique constraint: one record per city/state/zip combination
-- Using a unique index with coalesce to handle nulls properly
create unique index if not exists idx_local_context_unique 
  on public.local_context(city, coalesce(state, ''), coalesce(zip, ''));

-- Indexes for fast lookups
create index if not exists idx_local_context_city_state on public.local_context(city, state);
create index if not exists idx_local_context_zip on public.local_context(zip) where zip is not null;
create index if not exists idx_local_context_storm_flag on public.local_context(storm_flag) where storm_flag = true;
create index if not exists idx_local_context_expires_at on public.local_context(expires_at);

-- Function to get or create local context (with automatic refresh if expired)
create or replace function public.get_local_context(
  p_city text,
  p_state text default null,
  p_zip text default null
)
returns public.local_context
language plpgsql
security definer
as $$
declare
  v_context public.local_context;
  v_cache_key text;
begin
  -- Normalize inputs
  p_city := trim(lower(coalesce(p_city, '')));
  p_state := trim(upper(coalesce(p_state, '')));
  p_zip := trim(coalesce(p_zip, ''));
  
  if p_city = '' then
    raise exception 'City is required';
  end if;
  
  -- Try to find existing context
  select * into v_context
  from public.local_context
  where lower(city) = p_city
    and (p_state = '' or upper(coalesce(state, '')) = p_state)
    and (p_zip = '' or zip = p_zip)
  limit 1;
  
  -- If found and not expired, return it
  if v_context.id is not null and v_context.expires_at > now() then
    return v_context;
  end if;
  
  -- If expired or not found, return empty context (will be populated by application layer)
  -- The application will fetch weather and update this record
  if v_context.id is null then
    -- Create new record
    -- Use a different approach: check if exists first, then insert
    -- Since we can't use coalesce in unique constraint directly, we'll handle uniqueness in application logic
    -- For now, insert and let the unique index handle it
    begin
      insert into public.local_context (city, state, zip, updated_at, expires_at)
      values (p_city, nullif(p_state, ''), nullif(p_zip, ''), now(), now() + interval '24 hours')
      returning * into v_context;
    exception when unique_violation then
      -- If conflict, fetch existing
      select * into v_context
      from public.local_context
      where lower(city) = p_city
        and (p_state = '' or upper(coalesce(state, '')) = p_state)
        and (p_zip = '' or zip = p_zip)
      limit 1;
    end;
    
    -- If insert didn't happen due to conflict, fetch the existing one
    if v_context.id is null then
      select * into v_context
      from public.local_context
      where lower(city) = p_city
        and (p_state = '' or upper(coalesce(state, '')) = p_state)
        and (p_zip = '' or zip = p_zip)
      limit 1;
    end if;
  end if;
  
  return coalesce(v_context, row(null, p_city, nullif(p_state, ''), nullif(p_zip, ''), '{}'::jsonb, false, null, null, null, now(), now() + interval '24 hours')::public.local_context);
end;
$$;

-- Function to update local context with weather data
create or replace function public.update_local_context_weather(
  p_city text,
  p_state text default null,
  p_zip text default null,
  p_weather_data jsonb default '{}'::jsonb,
  p_storm_flag boolean default false,
  p_storm_type text default null,
  p_storm_date date default null
)
returns public.local_context
language plpgsql
security definer
as $$
declare
  v_context public.local_context;
begin
  -- Normalize inputs
  p_city := trim(lower(coalesce(p_city, '')));
  p_state := trim(upper(coalesce(p_state, '')));
  p_zip := trim(coalesce(p_zip, ''));
  
  -- Upsert local context
  -- First try to update existing
  update public.local_context
  set
    last_weather = p_weather_data,
    storm_flag = p_storm_flag,
    storm_type = p_storm_type,
    storm_date = p_storm_date,
    updated_at = now(),
    expires_at = now() + interval '24 hours'
  where lower(city) = p_city
    and (p_state = '' or upper(coalesce(state, '')) = p_state)
    and (p_zip = '' or zip = p_zip)
  returning * into v_context;
  
  -- If no row updated, insert new
  if v_context.id is null then
    insert into public.local_context (
      city, state, zip, last_weather, storm_flag, storm_type, storm_date, updated_at, expires_at
    )
    values (
      p_city, nullif(p_state, ''), nullif(p_zip, ''), p_weather_data, p_storm_flag, p_storm_type, p_storm_date, now(), now() + interval '24 hours'
    )
    returning * into v_context;
  end if;
  
  return v_context;
end;
$$;

-- Enable RLS
alter table public.local_context enable row level security;

-- RLS Policy: Users can read local_context (it's public data)
create policy "local_context read" on public.local_context
  for select using (true);

-- RLS Policy: Service role can write (for weather updates)
-- This will be handled by service role key in application code

-- Comments
comment on table public.local_context is 'Caches local context data (weather, storms) for personalization engine. Data expires after 24 hours.';
comment on column public.local_context.last_weather is 'JSON object with weather events, conditions, wind_speed, precipitation from last 7 days';
comment on column public.local_context.storm_flag is 'True if a significant storm (hail, wind, etc.) was detected in the area recently';
comment on column public.local_context.storm_type is 'Type of storm detected: hail, wind, rain, snow, hurricane';
comment on column public.local_context.storm_date is 'Date of the most recent storm event';

