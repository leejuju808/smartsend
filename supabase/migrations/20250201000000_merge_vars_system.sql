-- A) Leads: common fields + custom bag
alter table public.leads
  add column if not exists first_name text,
  add column if not exists last_name  text,
  add column if not exists full_name  text,
  add column if not exists company    text,
  add column if not exists title      text,
  add column if not exists website    text,
  add column if not exists city       text,
  add column if not exists state      text,
  add column if not exists country    text,
  add column if not exists vars       jsonb default '{}'::jsonb;

-- B) Campaign-level default variables
alter table public.campaigns
  add column if not exists default_vars jsonb default '{}'::jsonb;

-- C) Step templates already exist (subject_template, body_html_template)

-- D) Helper: safe coalesce json values
create or replace function public.json_get_text(p jsonb, key text, fallback text default null)
returns text language sql immutable as $$
  select coalesce(nullif(p->>key, ''), fallback)
$$;

-- E) Helper: infer first name if missing (from full_name or email localpart)
create or replace function public.infer_first_name(p_full text, p_email text)
returns text language plpgsql immutable as $$
declare
  v text := null;
begin
  if p_full is not null and length(p_full) > 0 then
    v := split_part(trim(p_full), ' ', 1);
  end if;
  if (v is null or v='') and p_email is not null then
    v := split_part(p_email, '@', 1);
    -- strip dots/underscores/numbers
    v := regexp_replace(v, '[._0-9]+', ' ', 'g');
    v := split_part(trim(v), ' ', 1);
  end if;
  if v is null or v='' then return null; end if;
  return initcap(v);
end $$;

-- F) Compute merge bag for (campaign, lead)
create or replace function public.merge_vars_for_lead(p_campaign uuid, p_lead uuid)
returns jsonb
language sql stable as $$
with c as (
  select default_vars from public.campaigns where id = p_campaign
),
l as (
  select email, first_name, last_name, full_name, company, title, website, city, state, country, vars
  from public.leads where id = p_lead
)
select
  coalesce(c.default_vars, '{}'::jsonb)
  || jsonb_build_object(
       'email', l.email,
       'first_name', coalesce(l.first_name, public.infer_first_name(l.full_name, l.email)),
       'last_name', l.last_name,
       'full_name', coalesce(l.full_name, concat_ws(' ', l.first_name, l.last_name)),
       'company', l.company,
       'title', l.title,
       'website', l.website,
       'city', l.city,
       'state', l.state,
       'country', l.country
     )
  || coalesce(l.vars, '{}'::jsonb)
from c, l;
$$;

-- G) (Optional) Index for common lookups
create index if not exists idx_leads_common on public.leads(user_id, company, domain) where user_id is not null;

