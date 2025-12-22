-- SmartSend Provider Failover + Health Scoring + Risk Radar
-- Mission: Send relentlessly at any scale with automatic provider failover, live health scoring, and risk radar

-- PROVIDERS TABLE
create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  type text not null check (type in ('ses', 'mailgun', 'mailersend', 'smtp')),
  config jsonb not null default '{}',
  weight int not null default 100 check (weight >= 0 and weight <= 1000),
  health_score numeric(5,4) not null default 0.9500 check (health_score >= 0 and health_score <= 1),
  daily_cap int not null default 10000,
  minute_cap int not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_providers_workspace on public.providers(workspace_id);
create index if not exists idx_providers_enabled on public.providers(enabled, health_score desc);
create index if not exists idx_providers_type on public.providers(type);

-- PROVIDER COUNTERS (per-minute and daily tracking)
create table if not exists public.provider_counters (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  date date not null,
  hour int not null check (hour >= 0 and hour <= 23),
  minute int not null check (minute >= 0 and minute <= 59),
  sent_count int not null default 0,
  success_count int not null default 0,
  failure_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_id, date, hour, minute)
);

create index if not exists idx_provider_counters_provider on public.provider_counters(provider_id);
create index if not exists idx_provider_counters_time on public.provider_counters(date, hour, minute);

-- DOMAIN RISK TABLE (risk radar)
create table if not exists public.domain_risk (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  domain text not null,
  risk_level text not null default 'normal' check (risk_level in ('normal', 'watch', 'high')),
  bounce_rate_7d numeric(5,4) not null default 0,
  bounce_rate_30d numeric(5,4) not null default 0,
  open_rate_7d numeric(5,4) not null default 0,
  open_rate_30d numeric(5,4) not null default 0,
  total_sent_7d int not null default 0,
  total_sent_30d int not null default 0,
  last_risk_update timestamptz not null default now(),
  risk_override text, -- manual override reason
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, domain)
);

create index if not exists idx_domain_risk_workspace on public.domain_risk(workspace_id);
create index if not exists idx_domain_risk_level on public.domain_risk(risk_level);
create index if not exists idx_domain_risk_domain on public.domain_risk(domain);

-- Add recipient_domain to email_events for risk radar learning
alter table public.email_events add column if not exists recipient_domain text;
create index if not exists idx_email_events_recipient_domain on public.email_events(recipient_domain);

-- Add provider_id to email_events for tracking which provider sent each email
alter table public.email_events add column if not exists provider_id uuid references public.providers(id);

-- RLS POLICIES
alter table public.providers enable row level security;
create policy "providers_workspace_member" on public.providers 
  for all using (is_member(workspace_id)) with check (is_member(workspace_id));

alter table public.provider_counters enable row level security;
create policy "provider_counters_workspace_member" on public.provider_counters 
  for all using (is_member((select workspace_id from public.providers where id = provider_id)));

alter table public.domain_risk enable row level security;
create policy "domain_risk_workspace_member" on public.domain_risk 
  for all using (is_member(workspace_id)) with check (is_member(workspace_id));

-- FUNCTIONS

-- Function to get provider pool (weighted by health score)
create or replace function get_provider_pool(workspace_id_param uuid)
returns table (
  id uuid,
  name text,
  type text,
  config jsonb,
  weight int,
  health_score numeric(5,4),
  daily_cap int,
  minute_cap int
) as $$
begin
  return query
  select 
    p.id,
    p.name,
    p.type,
    p.config,
    p.weight,
    p.health_score,
    p.daily_cap,
    p.minute_cap
  from public.providers p
  where p.workspace_id = workspace_id_param
    and p.enabled = true
    and p.health_score > 0.1 -- Don't use completely dead providers
  order by (p.health_score * p.weight) desc;
end;
$$ language plpgsql security definer;

-- Function to check if provider can send (respecting caps)
create or replace function can_provider_send(provider_id_param uuid)
returns boolean as $$
declare
  provider_record record;
  daily_count int;
  minute_count int;
  current_date date := current_date;
  current_hour int := extract(hour from now());
  current_minute int := extract(minute from now());
begin
  select * into provider_record from public.providers where id = provider_id_param;
  
  if not found or not provider_record.enabled then
    return false;
  end if;
  
  -- Check daily cap
  select coalesce(sum(sent_count), 0) into daily_count
  from public.provider_counters
  where provider_id = provider_id_param and date = current_date;
  
  if daily_count >= provider_record.daily_cap then
    return false;
  end if;
  
  -- Check minute cap
  select coalesce(sent_count, 0) into minute_count
  from public.provider_counters
  where provider_id = provider_id_param 
    and date = current_date 
    and hour = current_hour 
    and minute = current_minute;
  
  if minute_count >= provider_record.minute_cap then
    return false;
  end if;
  
  return true;
end;
$$ language plpgsql security definer;

-- Function to increment provider counters
create or replace function increment_provider_counters(provider_id_param uuid, success boolean)
returns void as $$
declare
  current_date date := current_date;
  current_hour int := extract(hour from now());
  current_minute int := extract(minute from now());
begin
  insert into public.provider_counters (provider_id, date, hour, minute, sent_count, success_count, failure_count)
  values (provider_id_param, current_date, current_hour, current_minute, 1, 
          case when success then 1 else 0 end,
          case when success then 0 else 1 end)
  on conflict (provider_id, date, hour, minute)
  do update set
    sent_count = provider_counters.sent_count + 1,
    success_count = provider_counters.success_count + case when success then 1 else 0 end,
    failure_count = provider_counters.failure_count + case when success then 0 else 1 end,
    updated_at = now();
end;
$$ language plpgsql security definer;

-- Function to update provider health score (EWMA)
create or replace function update_provider_health(provider_id_param uuid, success boolean)
returns void as $$
declare
  alpha numeric(5,4) := 0.1; -- 10% weight for new data
  current_score numeric(5,4);
  new_score numeric(5,4);
begin
  select health_score into current_score from public.providers where id = provider_id_param;
  
  if success then
    new_score := current_score * (1 - alpha) + 1.0 * alpha;
  else
    new_score := current_score * (1 - alpha) + 0.0 * alpha;
  end if;
  
  -- Ensure score stays in bounds
  new_score := greatest(0.0, least(1.0, new_score));
  
  update public.providers 
  set health_score = new_score, updated_at = now()
  where id = provider_id_param;
end;
$$ language plpgsql security definer;

-- Function to compute domain risk level
create or replace function compute_domain_risk(workspace_id_param uuid, domain_param text)
returns text as $$
declare
  risk_record record;
  bounce_rate_7d numeric(5,4);
  bounce_rate_30d numeric(5,4);
  open_rate_7d numeric(5,4);
  open_rate_30d numeric(5,4);
  risk_level text := 'normal';
begin
  -- Get existing risk record
  select * into risk_record from public.domain_risk 
  where workspace_id = workspace_id_param and domain = domain_param;
  
  -- Calculate 7-day metrics
  select 
    coalesce(count(*) filter (where event_type = 'bounced'), 0)::numeric / 
    nullif(count(*) filter (where event_type in ('sent', 'delivered')), 0)::numeric,
    coalesce(count(*) filter (where event_type = 'opened'), 0)::numeric / 
    nullif(count(*) filter (where event_type in ('sent', 'delivered')), 0)::numeric,
    count(*) filter (where event_type in ('sent', 'delivered'))
  into bounce_rate_7d, open_rate_7d, total_sent_7d
  from public.email_events
  where user_id in (select id from auth.users where id in (
    select user_id from public.workspace_members where workspace_id = workspace_id_param
  ))
  and recipient_domain = domain_param
  and created_at >= now() - interval '7 days';
  
  -- Calculate 30-day metrics
  select 
    coalesce(count(*) filter (where event_type = 'bounced'), 0)::numeric / 
    nullif(count(*) filter (where event_type in ('sent', 'delivered')), 0)::numeric,
    coalesce(count(*) filter (where event_type = 'opened'), 0)::numeric / 
    nullif(count(*) filter (where event_type in ('sent', 'delivered')), 0)::numeric,
    count(*) filter (where event_type in ('sent', 'delivered'))
  into bounce_rate_30d, open_rate_30d, total_sent_30d
  from public.email_events
  where user_id in (select id from auth.users where id in (
    select user_id from public.workspace_members where workspace_id = workspace_id_param
  ))
  and recipient_domain = domain_param
  and created_at >= now() - interval '30 days';
  
  -- Determine risk level based on metrics
  if bounce_rate_7d > 0.05 or bounce_rate_30d > 0.03 then
    risk_level := 'high';
  elsif bounce_rate_7d > 0.02 or bounce_rate_30d > 0.015 or open_rate_7d < 0.15 then
    risk_level := 'watch';
  else
    risk_level := 'normal';
  end if;
  
  -- Insert or update risk record
  if found then
    update public.domain_risk set
      risk_level = risk_level,
      bounce_rate_7d = bounce_rate_7d,
      bounce_rate_30d = bounce_rate_30d,
      open_rate_7d = open_rate_7d,
      open_rate_30d = open_rate_30d,
      total_sent_7d = total_sent_7d,
      total_sent_30d = total_sent_30d,
      last_risk_update = now(),
      updated_at = now()
    where id = risk_record.id;
  else
    insert into public.domain_risk (
      workspace_id, domain, risk_level, bounce_rate_7d, bounce_rate_30d,
      open_rate_7d, open_rate_30d, total_sent_7d, total_sent_30d
    ) values (
      workspace_id_param, domain_param, risk_level, bounce_rate_7d, bounce_rate_30d,
      open_rate_7d, open_rate_30d, total_sent_7d, total_sent_30d
    );
  end if;
  
  return risk_level;
end;
$$ language plpgsql security definer;

-- Function to get domain risk level
create or replace function get_domain_risk(workspace_id_param uuid, domain_param text)
returns text as $$
declare
  risk_level text;
begin
  select risk_level into risk_level
  from public.domain_risk
  where workspace_id = workspace_id_param and domain = domain_param;
  
  return coalesce(risk_level, 'normal');
end;
$$ language plpgsql security definer;

-- Function to check if domain can send (risk-based)
create or replace function can_domain_send(workspace_id_param uuid, domain_param text)
returns table (
  allowed boolean,
  risk_level text,
  delay_minutes int,
  reason text
) as $$
declare
  risk_level text;
  delay_minutes int := 0;
begin
  -- Get or compute risk level
  select compute_domain_risk(workspace_id_param, domain_param) into risk_level;
  
  case risk_level
    when 'high' then
      return query select false, risk_level, 1440, 'Domain blocked due to high risk';
    when 'watch' then
      delay_minutes := 60 + (random() * 120)::int; -- 60-180 minute delay
      return query select true, risk_level, delay_minutes, 'Domain slowed due to watch risk';
    else
      return query select true, risk_level, 0, 'Domain normal';
  end case;
end;
$$ language plpgsql security definer;

-- TRIGGERS
create or replace function update_provider_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_providers_updated_at
  before update on public.providers
  for each row execute function update_provider_updated_at();

create trigger trigger_provider_counters_updated_at
  before update on public.provider_counters
  for each row execute function update_provider_updated_at();

create trigger trigger_domain_risk_updated_at
  before update on public.domain_risk
  for each row execute function update_provider_updated_at();

-- Update email_events to set recipient_domain when not provided
create or replace function set_recipient_domain()
returns trigger as $$
begin
  if new.recipient_domain is null and new.email_lower is not null then
    new.recipient_domain := split_part(new.email_lower, '@', 2);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trigger_email_events_recipient_domain
  before insert on public.email_events
  for each row execute function set_recipient_domain(); 