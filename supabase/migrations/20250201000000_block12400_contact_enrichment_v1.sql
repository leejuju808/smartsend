-- Block 12400 — Contact Enrichment v1
-- Auto-Fill Location, Roof Type, Property Data, Homeowner Insights
-- Enriches contacts with location data, property type, roof type, and homeowner insights

-- ============================================================================
-- 1. ADD ENRICHMENT COLUMNS TO CONTACTS TABLE
-- ============================================================================

alter table public.contacts
  add column if not exists county text,
  add column if not exists timezone text,
  add column if not exists homeowner_likelihood text check (homeowner_likelihood in ('high', 'medium', 'low', 'unknown')),
  add column if not exists property_type_guess text check (property_type_guess in ('single-family', 'multi-family', 'commercial', 'unknown')),
  add column if not exists roof_type_guess text check (roof_type_guess in ('asphalt', 'tile', 'metal', 'ballast', 'flat', 'unknown')),
  add column if not exists storm_risk_level text check (storm_risk_level in ('hail', 'wind', 'hurricane', 'low')),
  add column if not exists enriched_at timestamptz;

-- Create indexes for filtering
create index if not exists idx_contacts_county on public.contacts(county) where county is not null;
create index if not exists idx_contacts_property_type on public.contacts(property_type_guess) where property_type_guess is not null;
create index if not exists idx_contacts_roof_type on public.contacts(roof_type_guess) where roof_type_guess is not null;
create index if not exists idx_contacts_storm_risk on public.contacts(storm_risk_level) where storm_risk_level is not null;
create index if not exists idx_contacts_homeowner_likelihood on public.contacts(homeowner_likelihood) where homeowner_likelihood is not null;

-- ============================================================================
-- 2. CREATE LOOKUP TABLES FOR ENRICHMENT DATA
-- ============================================================================

-- ZIP to County lookup (simplified - can be expanded with full dataset)
create table if not exists public.zip_county_lookup (
  zip_code text primary key,
  county text not null,
  state text not null,
  timezone text not null,
  created_at timestamptz default now()
);

create index if not exists idx_zip_county_state on public.zip_county_lookup(state, county);

-- ZIP to Storm Region mapping
create table if not exists public.zip_storm_regions (
  zip_code text primary key,
  storm_risk_level text not null check (storm_risk_level in ('hail', 'wind', 'hurricane', 'low')),
  region_name text,
  created_at timestamptz default now()
);

create index if not exists idx_zip_storm_risk on public.zip_storm_regions(storm_risk_level);

-- State/Region to Roof Type mapping (heuristic)
create table if not exists public.region_roof_types (
  state text,
  zip_prefix text, -- First 3 digits of ZIP for regional patterns
  roof_type text not null check (roof_type in ('asphalt', 'tile', 'metal', 'ballast', 'flat')),
  probability numeric default 0.7, -- How common this roof type is in this region
  created_at timestamptz default now(),
  primary key (state, zip_prefix)
);

create index if not exists idx_region_roof_state on public.region_roof_types(state);

-- ============================================================================
-- 3. POPULATE LOOKUP TABLES WITH INITIAL DATA
-- ============================================================================

-- Insert common ZIP to County/Timezone mappings (sample data - expand as needed)
-- Focus on major roofing markets: TX, FL, CA, CO, OK, KS, etc.
insert into public.zip_county_lookup (zip_code, county, state, timezone)
values
  -- Texas (Hail Alley)
  ('76001', 'Tarrant', 'TX', 'America/Chicago'),
  ('76002', 'Tarrant', 'TX', 'America/Chicago'),
  ('75001', 'Dallas', 'TX', 'America/Chicago'),
  ('75002', 'Dallas', 'TX', 'America/Chicago'),
  ('77001', 'Harris', 'TX', 'America/Chicago'),
  ('77002', 'Harris', 'TX', 'America/Chicago'),
  -- Florida (Hurricane/Tile)
  ('33101', 'Miami-Dade', 'FL', 'America/New_York'),
  ('33102', 'Miami-Dade', 'FL', 'America/New_York'),
  ('32801', 'Orange', 'FL', 'America/New_York'),
  ('32802', 'Orange', 'FL', 'America/New_York'),
  -- California (Tile)
  ('90001', 'Los Angeles', 'CA', 'America/Los_Angeles'),
  ('90002', 'Los Angeles', 'CA', 'America/Los_Angeles'),
  ('90210', 'Los Angeles', 'CA', 'America/Los_Angeles'),
  -- Colorado (Hail)
  ('80001', 'Arapahoe', 'CO', 'America/Denver'),
  ('80002', 'Arapahoe', 'CO', 'America/Denver'),
  ('80201', 'Denver', 'CO', 'America/Denver'),
  -- Oklahoma (Hail)
  ('73001', 'Oklahoma', 'OK', 'America/Chicago'),
  ('73002', 'Oklahoma', 'OK', 'America/Chicago'),
  -- Kansas (Hail)
  ('66001', 'Johnson', 'KS', 'America/Chicago'),
  ('66002', 'Johnson', 'KS', 'America/Chicago')
on conflict (zip_code) do nothing;

-- Insert storm region mappings
insert into public.zip_storm_regions (zip_code, storm_risk_level, region_name)
values
  -- Hail Alley (TX, OK, KS, CO)
  ('76001', 'hail', 'Hail Alley - Texas'),
  ('76002', 'hail', 'Hail Alley - Texas'),
  ('75001', 'hail', 'Hail Alley - Texas'),
  ('75002', 'hail', 'Hail Alley - Texas'),
  ('80001', 'hail', 'Hail Alley - Colorado'),
  ('80002', 'hail', 'Hail Alley - Colorado'),
  ('80201', 'hail', 'Hail Alley - Colorado'),
  ('73001', 'hail', 'Hail Alley - Oklahoma'),
  ('73002', 'hail', 'Hail Alley - Oklahoma'),
  ('66001', 'hail', 'Hail Alley - Kansas'),
  ('66002', 'hail', 'Hail Alley - Kansas'),
  -- Hurricane zones (FL, coastal states)
  ('33101', 'hurricane', 'Hurricane Zone - Florida'),
  ('33102', 'hurricane', 'Hurricane Zone - Florida'),
  ('32801', 'hurricane', 'Hurricane Zone - Florida'),
  ('32802', 'hurricane', 'Hurricane Zone - Florida'),
  -- Wind-prone (Midwest)
  ('66001', 'wind', 'Wind-Prone Region'),
  ('66002', 'wind', 'Wind-Prone Region')
on conflict (zip_code) do update set storm_risk_level = excluded.storm_risk_level;

-- Insert roof type mappings by state/region
insert into public.region_roof_types (state, zip_prefix, roof_type, probability)
values
  -- Florida - Tile common
  ('FL', '331', 'tile', 0.6),
  ('FL', '328', 'tile', 0.5),
  -- California - Tile common
  ('CA', '900', 'tile', 0.7),
  ('CA', '902', 'tile', 0.8),
  -- Arizona - Tile common
  ('AZ', '850', 'tile', 0.6),
  ('AZ', '852', 'tile', 0.5),
  -- Texas - Asphalt & Metal
  ('TX', '760', 'asphalt', 0.7),
  ('TX', '750', 'asphalt', 0.7),
  ('TX', '770', 'asphalt', 0.6),
  ('TX', '760', 'metal', 0.3),
  ('TX', '750', 'metal', 0.2),
  -- Oklahoma - Asphalt & Metal
  ('OK', '730', 'asphalt', 0.7),
  ('OK', '730', 'metal', 0.2),
  -- Colorado - Asphalt
  ('CO', '800', 'asphalt', 0.8),
  ('CO', '802', 'asphalt', 0.8),
  -- Commercial areas (downtown ZIPs) - Flat/Ballast
  ('TX', '752', 'flat', 0.4), -- Dallas downtown
  ('CA', '900', 'flat', 0.3), -- LA downtown
  ('FL', '331', 'flat', 0.3)  -- Miami downtown
on conflict (state, zip_prefix) do update set roof_type = excluded.roof_type;

-- ============================================================================
-- 4. ENRICHMENT FUNCTION
-- ============================================================================

create or replace function public.enrich_contact(
  p_contact_id uuid,
  p_address text default null,
  p_city text default null,
  p_state text default null,
  p_zip text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_zip_code text;
  v_county text;
  v_timezone text;
  v_storm_risk text;
  v_roof_type text;
  v_property_type text;
  v_homeowner_likelihood text;
  v_zip_prefix text;
  v_state_code text;
begin
  -- Extract ZIP code from provided data
  v_zip_code := coalesce(p_zip, '');
  
  -- If ZIP is empty but address provided, try to extract from address
  if v_zip_code = '' and p_address is not null then
    -- Simple regex to extract ZIP (5 digits or 5+4 format)
    v_zip_code := substring(p_address from '\b(\d{5}(?:-\d{4})?)\b');
  end if;
  
  -- Normalize ZIP (take first 5 digits)
  v_zip_code := substring(v_zip_code from '^(\d{5})');
  
  -- Normalize state (uppercase, 2-letter code)
  v_state_code := upper(coalesce(p_state, ''));
  if length(v_state_code) > 2 then
    -- Try to extract 2-letter code from full state name
    -- This is simplified - could use a state name lookup table
    v_state_code := upper(substring(v_state_code from '^([A-Z]{2})'));
  end if;
  
  -- Get ZIP prefix for regional patterns (first 3 digits)
  v_zip_prefix := substring(v_zip_code from '^(\d{3})');
  
  -- Step 1: Lookup County and Timezone
  select county, timezone into v_county, v_timezone
  from public.zip_county_lookup
  where zip_code = v_zip_code
  limit 1;
  
  -- Step 2: Lookup Storm Risk
  select storm_risk_level into v_storm_risk
  from public.zip_storm_regions
  where zip_code = v_zip_code
  limit 1;
  
  -- Default to 'low' if not found
  v_storm_risk := coalesce(v_storm_risk, 'low');
  
  -- Step 3: Determine Roof Type (heuristic)
  if v_state_code = 'FL' or v_state_code = 'CA' or v_state_code = 'AZ' then
    -- Tile common in FL, CA, AZ
    select roof_type into v_roof_type
    from public.region_roof_types
    where state = v_state_code
      and zip_prefix = v_zip_prefix
      and roof_type = 'tile'
    limit 1;
    
    if v_roof_type is null then
      v_roof_type := 'tile'; -- Default for these states
    end if;
  elsif v_state_code = 'TX' or v_state_code = 'OK' or v_state_code = 'CO' then
    -- Asphalt common, some metal
    select roof_type into v_roof_type
    from public.region_roof_types
    where state = v_state_code
      and zip_prefix = v_zip_prefix
      and roof_type in ('asphalt', 'metal')
    order by probability desc
    limit 1;
    
    if v_roof_type is null then
      v_roof_type := 'asphalt'; -- Default
    end if;
  else
    -- Default to asphalt for most other areas
    v_roof_type := 'asphalt';
  end if;
  
  -- Step 4: Determine Property Type (heuristic)
  v_property_type := 'unknown';
  
  if p_address is not null then
    -- Check for apartment/unit indicators
    if upper(p_address) ~ '(APT|APARTMENT|UNIT|#|STE|SUITE|BLDG|BUILDING)' then
      if upper(p_address) ~ '(STE|SUITE|BLDG|BUILDING|OFFICE)' then
        v_property_type := 'commercial';
      else
        v_property_type := 'multi-family';
      end if;
    -- Check for residential street suffixes
    elsif upper(p_address) ~ '(LN|LANE|DR|DRIVE|RD|ROAD|CT|COURT|ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|PL|PLACE|WAY)$' then
      v_property_type := 'single-family';
    end if;
  end if;
  
  -- Step 5: Determine Homeowner Likelihood
  v_homeowner_likelihood := 'unknown';
  
  if v_property_type = 'single-family' then
    v_homeowner_likelihood := 'high';
  elsif v_property_type = 'multi-family' then
    v_homeowner_likelihood := 'low';
  elsif v_property_type = 'commercial' then
    v_homeowner_likelihood := 'low';
  elsif p_address is not null and upper(p_address) !~ '(APT|APARTMENT|UNIT|#)' then
    v_homeowner_likelihood := 'medium';
  end if;
  
  -- Step 6: Update contact record
  update public.contacts
  set
    county = v_county,
    timezone = v_timezone,
    homeowner_likelihood = v_homeowner_likelihood,
    property_type_guess = v_property_type,
    roof_type_guess = v_roof_type,
    storm_risk_level = v_storm_risk,
    enriched_at = now(),
    updated_at = now()
  where id = p_contact_id;
  
  -- Return enrichment results
  return jsonb_build_object(
    'county', v_county,
    'timezone', v_timezone,
    'homeowner_likelihood', v_homeowner_likelihood,
    'property_type_guess', v_property_type,
    'roof_type_guess', v_roof_type,
    'storm_risk_level', v_storm_risk,
    'enriched_at', now()
  );
end;
$$;

-- ============================================================================
-- 5. TRIGGER TO AUTO-ENRICH ON CONTACT CREATION/UPDATE
-- ============================================================================

create or replace function public.trigger_enrich_contact()
returns trigger
language plpgsql
as $$
begin
  -- Only enrich if address data is available and contact hasn't been enriched recently
  if (new.address is not null or new.city is not null or new.state is not null or new.zip is not null)
     and (new.enriched_at is null or new.enriched_at < now() - interval '30 days') then
    perform public.enrich_contact(
      new.id,
      new.address,
      new.city,
      new.state,
      new.zip
    );
  end if;
  
  return new;
end;
$$;

-- Drop trigger if exists and recreate
drop trigger if exists trg_enrich_contact_insert on public.contacts;
create trigger trg_enrich_contact_insert
  after insert on public.contacts
  for each row
  execute function public.trigger_enrich_contact();

drop trigger if exists trg_enrich_contact_update on public.contacts;
create trigger trg_enrich_contact_update
  after update on public.contacts
  for each row
  when (
    (old.address is distinct from new.address) or
    (old.city is distinct from new.city) or
    (old.state is distinct from new.state) or
    (old.zip is distinct from new.zip)
  )
  execute function public.trigger_enrich_contact();

-- ============================================================================
-- 6. BULK ENRICHMENT FUNCTION
-- ============================================================================

create or replace function public.enrich_contacts_bulk(
  p_contact_ids uuid[] default null,
  p_workspace_id uuid default null,
  p_limit int default 1000
)
returns table(
  contact_id uuid,
  enriched boolean,
  result jsonb
)
language plpgsql
security definer
as $$
declare
  v_contact record;
  v_count int := 0;
begin
  -- Enrich contacts that haven't been enriched or need re-enrichment
  for v_contact in
    select c.id, c.address, c.city, c.state, c.zip
    from public.contacts c
    where (p_contact_ids is null or c.id = any(p_contact_ids))
      and (p_workspace_id is null or c.workspace_id = p_workspace_id)
      and (c.address is not null or c.city is not null or c.state is not null or c.zip is not null)
      and (c.enriched_at is null or c.enriched_at < now() - interval '30 days')
    limit p_limit
  loop
    begin
      return query
      select
        v_contact.id as contact_id,
        true as enriched,
        public.enrich_contact(
          v_contact.id,
          v_contact.address,
          v_contact.city,
          v_contact.state,
          v_contact.zip
        ) as result;
      
      v_count := v_count + 1;
    exception when others then
      return query
      select
        v_contact.id as contact_id,
        false as enriched,
        jsonb_build_object('error', sqlerrm) as result;
    end;
  end loop;
  
  return;
end;
$$;

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

comment on column public.contacts.county is 'County name extracted from ZIP code lookup';
comment on column public.contacts.timezone is 'Timezone extracted from ZIP code lookup';
comment on column public.contacts.homeowner_likelihood is 'Likelihood this contact is a homeowner (high/medium/low/unknown)';
comment on column public.contacts.property_type_guess is 'Estimated property type based on address patterns';
comment on column public.contacts.roof_type_guess is 'Estimated roof type based on state/region heuristics';
comment on column public.contacts.storm_risk_level is 'Storm risk level for this ZIP code (hail/wind/hurricane/low)';
comment on column public.contacts.enriched_at is 'Timestamp when contact was last enriched';

comment on function public.enrich_contact is 'Enriches a single contact with location, property, and roof type data';
comment on function public.enrich_contacts_bulk is 'Bulk enriches multiple contacts, returns results per contact';




























































