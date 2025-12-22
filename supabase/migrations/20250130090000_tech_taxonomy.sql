-- 1) Tech taxonomy + helpers

-- A) Tech taxonomy (normalized tags + synonyms)
create table if not exists public.tech_taxonomy (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  category text not null default 'saas',
  synonyms text[] not null default '{}',
  popularity int not null default 0,
  unique(tag)
);

create index if not exists idx_tech_tax_tag on public.tech_taxonomy(tag);
create index if not exists idx_tech_tax_syn on public.tech_taxonomy using gin (synonyms);

-- B) Seed a few (extend later)
insert into public.tech_taxonomy(tag, category, synonyms, popularity) values
  ('HubSpot', 'crm', array['hub spot', 'hub-spot'], 1000),
  ('Salesforce', 'crm', array['sfdc', 'sales force'], 1200),
  ('Intercom', 'support', array['inter com'], 700),
  ('Segment', 'analytics', array['segment io', 'twilio segment'], 600),
  ('Postgres', 'db', array['postgresql', 'psql'], 1500),
  ('Snowflake', 'data_warehouse', array['snow flake'], 900)
on conflict (tag) do update set popularity = excluded.popularity;

-- C) Suggest RPC (prefix match across tag+synonyms; order by popularity)
create or replace function public.suggest_tech_stack(p_prefix text, p_limit int default 12)
returns table(tag text, category text, score real)
language sql
stable
as $$
  with q as (
    select lower(trim(coalesce(p_prefix, ''))) as q
  )
  select
    t.tag,
    t.category,
    (
      case
        when lower(t.tag) like (select q || '%' from q) then 1.0
        when exists (
          select 1
          from unnest(t.synonyms) s
          where lower(s) like (select q || '%' from q)
        ) then 0.8
        else 0.5
      end
    )
    + (least(t.popularity, 2000)::real / 5000.0) as score
  from public.tech_taxonomy t, q
  where
    (lower(t.tag) like (q.q || '%')
      or exists (
        select 1
        from unnest(t.synonyms) s
        where lower(s) like (q.q || '%')
      )
    )
  order by score desc
  limit p_limit;
$$;


