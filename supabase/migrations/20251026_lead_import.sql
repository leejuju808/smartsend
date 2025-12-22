-- Ensure leads table has needed columns
alter table if exists public.leads
  add column if not exists campaign_id uuid,
  add column if not exists email text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists company text,
  add column if not exists title text,
  add column if not exists website text,
  add column if not exists custom1 text,
  add column if not exists custom2 text,
  add column if not exists custom3 text,
  add column if not exists status text default 'new',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Uniqueness per (campaign_id, email)
create unique index if not exists uq_leads_campaign_email on public.leads (campaign_id, lower(email)) where campaign_id is not null;

-- Create campaign_events table for audit logging
create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  event_type text not null,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_campaign_events_campaign on public.campaign_events(campaign_id);
create index if not exists idx_campaign_events_type on public.campaign_events(event_type);

-- RPC: bulk upsert with dedupe + audit
create or replace function public.bulk_upsert_leads(
  p_campaign_id uuid,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_inserted int := 0;
  v_updated int := 0;
begin
  -- Use a temp table for performance
  create temporary table tmp_leads
  (
    email text,
    first_name text,
    last_name text,
    company text,
    title text,
    website text,
    custom1 text,
    custom2 text,
    custom3 text,
    status text
  ) on commit drop;

  insert into tmp_leads (email, first_name, last_name, company, title, website, custom1, custom2, custom3, status)
  select
    (elem->>'email')::text,
    nullif(elem->>'first_name',''),
    nullif(elem->>'last_name',''),
    nullif(elem->>'company',''),
    nullif(elem->>'title',''),
    nullif(elem->>'website',''),
    nullif(elem->>'custom1',''),
    nullif(elem->>'custom2',''),
    nullif(elem->>'custom3',''),
    coalesce(nullif(elem->>'status',''), 'new')
  from jsonb_array_elements(p_rows) as elem;

  -- Upsert
  with up as (
    insert into public.leads as l (
      campaign_id, email, first_name, last_name, company, title, website,
      custom1, custom2, custom3, status, created_at, updated_at
    )
    select
      p_campaign_id, lower(t.email), t.first_name, t.last_name, t.company, t.title, t.website,
      t.custom1, t.custom2, t.custom3, t.status, now(), now()
    from tmp_leads t
    on conflict (campaign_id, email) where campaign_id is not null do update
      set first_name = excluded.first_name,
          last_name  = excluded.last_name,
          company    = excluded.company,
          title      = excluded.title,
          website    = excluded.website,
          custom1    = excluded.custom1,
          custom2    = excluded.custom2,
          custom3    = excluded.custom3,
          status     = case when leads.status = 'replied' then leads.status else excluded.status end,
          updated_at = now()
      where (coalesce(leads.first_name,'') is distinct from coalesce(excluded.first_name,''))
         or (coalesce(leads.last_name,'')  is distinct from coalesce(excluded.last_name,''))
         or (coalesce(leads.company,'')    is distinct from coalesce(excluded.company,''))
         or (coalesce(leads.title,'')      is distinct from excluded.title)
         or (coalesce(leads.website,'')    is distinct from coalesce(excluded.website,''))
         or (coalesce(leads.custom1,'')    is distinct from coalesce(excluded.custom1,''))
         or (coalesce(leads.custom2,'')    is distinct from coalesce(excluded.custom2,''))
         or (coalesce(leads.custom3,'')    is distinct from coalesce(excluded.custom3,''))
         or (coalesce(leads.status,'new')  is distinct from coalesce(excluded.status,'new'))
    returning (xmax = 0) as inserted
  )
  select
    sum((inserted)::int) into v_inserted
  from up;

  -- Count updated (total - inserted)
  with up as (
    insert into public.leads as l (
      campaign_id, email, first_name, last_name, company, title, website,
      custom1, custom2, custom3, status, created_at, updated_at
    )
    select
      p_campaign_id, lower(t.email), t.first_name, t.last_name, t.company, t.title, t.website,
      t.custom1, t.custom2, t.custom3, t.status, now(), now()
    from tmp_leads t
    on conflict (campaign_id, email) where campaign_id is not null do update
      set first_name = excluded.first_name,
          last_name  = excluded.last_name,
          company    = excluded.company,
          title      = excluded.title,
          website    = excluded.website,
          custom1    = excluded.custom1,
          custom2    = excluded.custom2,
          custom3    = excluded.custom3,
          status     = case when leads.status = 'replied' then leads.status else excluded.status end,
          updated_at = now()
      where (coalesce(leads.first_name,'') is distinct from coalesce(excluded.first_name,''))
         or (coalesce(leads.last_name,'')  is distinct from coalesce(excluded.last_name,''))
         or (coalesce(leads.company,'')    is distinct from coalesce(excluded.company,''))
         or (coalesce(leads.title,'')      is distinct from excluded.title)
         or (coalesce(leads.website,'')    is distinct from coalesce(excluded.website,''))
         or (coalesce(leads.custom1,'')    is distinct from coalesce(excluded.custom1,''))
         or (coalesce(leads.custom2,'')    is distinct from coalesce(excluded.custom2,''))
         or (coalesce(leads.custom3,'')    is distinct from coalesce(excluded.custom3,''))
         or (coalesce(leads.status,'new')  is distinct from coalesce(excluded.status,'new'))
    returning id
  )
  select count(*) into v_updated from up;

  v_updated := v_updated - v_inserted;

  -- Optional audit event
  insert into public.campaign_events (campaign_id, event_type, meta)
  values (p_campaign_id, 'lead_import', jsonb_build_object('inserted', v_inserted, 'updated', v_updated));

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end;
$$;

-- Grant execute permission to service role
grant execute on function public.bulk_upsert_leads(uuid, jsonb) to service_role;
