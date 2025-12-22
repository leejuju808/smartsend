-- Lead enrichment helpers and RPCs
-- Run in Supabase SQL or via migrations tooling

-- A) Ensure target columns exist
alter table public.leads
  add column if not exists tz text,             -- IANA tz, e.g., "America/Los_Angeles"
  add column if not exists country text;        -- ISO-3166-1 alpha-2 (upper), e.g., "US";

create index if not exists idx_leads_tz_null on public.leads((tz is null));
create index if not exists idx_leads_country_null on public.leads((country is null));

-- B) Override map (your curated, exact matches win)
create table if not exists public.domain_enrichment_overrides (
  domain text primary key,              -- lower-case exact domain, e.g., 'acme.com'
  country text,                         -- 'US', 'CA', 'GB'...
  tz text,                              -- IANA tz; if null we’ll derive from country default below
  note text,
  updated_at timestamptz not null default now()
);

create or replace function public._touch_domain_override()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_touch_domain_override on public.domain_enrichment_overrides;
create trigger trg_touch_domain_override
before update on public.domain_enrichment_overrides
for each row execute function public._touch_domain_override();

-- C) Common providers (gmail/outlook/yahoo etc.) → countryless global defaults
create table if not exists public.common_provider_domains (
  domain text primary key,      -- e.g., 'gmail.com'
  provider text,                -- 'gmail' | 'outlook' | 'yahoo' | 'icloud' | 'aol' | ...
  default_country text,         -- e.g., 'US' (kept generic; doesn’t imply recipient location)
  default_tz text               -- tz to prefer when nothing else is known; keep null to avoid mislabeling
);

insert into public.common_provider_domains(domain, provider, default_country, default_tz) values
  ('gmail.com','gmail','US',null),
  ('googlemail.com','gmail','US',null),
  ('outlook.com','outlook','US',null),
  ('hotmail.com','outlook','US',null),
  ('live.com','outlook','US',null),
  ('yahoo.com','yahoo','US',null),
  ('icloud.com','icloud','US',null),
  ('aol.com','aol','US',null)
on conflict (domain) do nothing;

-- D) TLD → country (quick map; expand later as needed)
create table if not exists public.tld_country_map (
  tld text primary key,   -- without dot, e.g., 'uk'
  country text not null   -- ISO-2
);

insert into public.tld_country_map(tld, country) values
  ('us','US'),('ca','CA'),('mx','MX'),('br','BR'),
  ('uk','GB'),('ie','IE'),('de','DE'),('fr','FR'),('es','ES'),('it','IT'),
  ('nl','NL'),('se','SE'),('no','NO'),('dk','DK'),('fi','FI'),
  ('au','AU'),('nz','NZ'),
  ('in','IN'),('sg','SG'),('jp','JP'),('kr','KR'),
  ('za','ZA'),('ae','AE')
on conflict (tld) do nothing;

-- E) Country default tz (capital/canonical; you can refine later by region)
create table if not exists public.country_default_tz (
  country text primary key,   -- ISO-2
  tz text not null
);

insert into public.country_default_tz(country, tz) values
  ('US','America/New_York'),
  ('CA','America/Toronto'),
  ('GB','Europe/London'),
  ('IE','Europe/Dublin'),
  ('DE','Europe/Berlin'),
  ('FR','Europe/Paris'),
  ('ES','Europe/Madrid'),
  ('IT','Europe/Rome'),
  ('NL','Europe/Amsterdam'),
  ('SE','Europe/Stockholm'),
  ('NO','Europe/Oslo'),
  ('DK','Europe/Copenhagen'),
  ('FI','Europe/Helsinki'),
  ('MX','America/Mexico_City'),
  ('BR','America/Sao_Paulo'),
  ('AU','Australia/Sydney'),
  ('NZ','Pacific/Auckland'),
  ('IN','Asia/Kolkata'),
  ('SG','Asia/Singapore'),
  ('JP','Asia/Tokyo'),
  ('KR','Asia/Seoul'),
  ('ZA','Africa/Johannesburg'),
  ('AE','Asia/Dubai')
on conflict (country) do nothing;

-- F) Helper: extract lower domain from email
create or replace function public.email_domain(p_email text)
returns text language sql immutable as $$
  select case when position('@' in coalesce(p_email,''))>0
         then lower(split_part(p_email,'@',2)) else null end
$$;

-- G) Helper: get registrable domain (naive cut to 2 labels; good enough for lite)
drop function if exists public.registrable_domain(text);
create or replace function public.registrable_domain(p_domain text)
returns text language sql immutable as $$
  select case
    when p_domain is null then null
    else (
      case
        when regexp_match(p_domain, '^[^.]+\.[^.]+$') is not null then lower(p_domain)
        else lower((regexp_replace(p_domain, '.*?([^.]+\.[^.]+)$', '\1')))
      end
    )
  end
$$;

-- H) Core heuristic: decide country/tz from (override | provider | TLD)
drop function if exists public.enrich_guess(text);
create or replace function public.enrich_guess(p_email text)
returns jsonb
language plpgsql
stable
as $$
declare
  dom text := public.email_domain(p_email);
  reg text := public.registrable_domain(dom);
  o record;
  prov record;
  c2 text := null;
  tz2 text := null;
  tld text := null;
begin
  if dom is null then
    return jsonb_build_object('domain', null, 'country', null, 'tz', null, 'source','none');
  end if;

  -- Exact domain override wins
  select * into o from public.domain_enrichment_overrides where domain = dom;
  if found then
    return jsonb_build_object('domain', dom, 'country', o.country, 'tz', coalesce(o.tz, null), 'source','override');
  end if;

  -- Common providers (gmail, etc.) → do not force tz unless you configured one
  select * into prov from public.common_provider_domains where domain = reg;
  if found then
    return jsonb_build_object('domain', reg, 'country', prov.default_country, 'tz', prov.default_tz, 'source','provider');
  end if;

  -- TLD country
  tld := (regexp_match(reg, '\.([^.]+)$'))[1];
  if tld is not null then
    select country into c2 from public.tld_country_map where tld = lower(tld);
    if c2 is not null then
      select tz into tz2 from public.country_default_tz where country = c2;
      return jsonb_build_object('domain', reg, 'country', c2, 'tz', tz2, 'source','tld');
    end if;
  end if;

  return jsonb_build_object('domain', reg, 'country', null, 'tz', null, 'source','unknown');
end;
$$;

-- I) RPC: enrich a single lead (respecting existing values unless force=true)
drop function if exists public.enrich_lead(uuid, boolean);
create or replace function public.enrich_lead(p_lead uuid, p_force boolean default false)
returns jsonb
language plpgsql
security definer
as $$
declare
  l record;
  g jsonb;
  new_country text;
  new_tz text;
begin
  select id, email, country, tz into l from public.leads where id = p_lead;
  if not found then raise exception 'lead not found'; end if;

  g := public.enrich_guess(l.email);
  new_country := (g->>'country');
  new_tz := (g->>'tz');

  update public.leads
     set country = case when p_force or country is null then new_country else country end,
         tz      = case when p_force or tz is null then new_tz else tz end
   where id = p_lead;

  return jsonb_build_object(
    'lead_id', l.id,
    'email', l.email,
    'previous', jsonb_build_object('country', l.country, 'tz', l.tz),
    'guessed', g,
    'applied', jsonb_build_object('country', case when p_force or l.country is null then new_country else l.country end,
                                   'tz',      case when p_force or l.tz is null then new_tz else l.tz end)
  );
end;
$$;

revoke all on function public.enrich_lead(uuid, boolean) from public;
grant execute on function public.enrich_lead(uuid, boolean) to authenticated, service_role;

-- J) RPC: batch — enrich by campaign (only nulls unless force=true)
drop function if exists public.enrich_missing_for_campaign(uuid, boolean, int);
create or replace function public.enrich_missing_for_campaign(p_campaign uuid, p_force boolean default false, p_limit int default 500)
returns jsonb
language plpgsql
security definer
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select l.id
    from public.campaign_leads cl
    join public.leads l on l.id = cl.lead_id
    where cl.campaign_id = p_campaign
      and (p_force or l.country is null or l.tz is null)
    limit greatest(p_limit, 1)
  loop
    perform public.enrich_lead(r.id, p_force);
    n := n + 1;
  end loop;
  return jsonb_build_object('campaign_id', p_campaign, 'processed', n, 'force', p_force);
end;
$$;

revoke all on function public.enrich_missing_for_campaign(uuid, boolean, int) from public;
grant execute on function public.enrich_missing_for_campaign(uuid, boolean, int) to authenticated, service_role;

-- K) Optional: auto-enrich trigger on new lead rows (only if nulls)
drop trigger if exists trg_auto_enrich_lead on public.leads;
drop function if exists public._on_lead_auto_enrich();
create or replace function public._on_lead_auto_enrich()
returns trigger
language plpgsql
security definer
as $$
begin
  if (new.country is null or new.tz is null) and new.email is not null then
    perform public.enrich_lead(new.id, false);
  end if;
  return new;
end;
$$;

create trigger trg_auto_enrich_lead
after insert on public.leads
for each row execute function public._on_lead_auto_enrich();





