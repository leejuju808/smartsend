-- Inbound routing rules & resolver

-- Ensure citext available
create extension if not exists citext;

-- A) Per-account routing rules
create table if not exists public.inbound_routing_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,

  -- Matchers (highest priority match wins). Any provided field must match.
  to_email citext,        -- exact email match
  to_domain citext,       -- e.g., example.com
  plus_tag citext,        -- match user+{tag}@domain (tag only)
  campaign_slug citext,   -- optional convenience

  -- Target
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  priority int not null default 100,  -- 1 highest … 999 lowest
  enabled boolean not null default true
);

create index if not exists idx_route_account_prio on public.inbound_routing_rules(account_id, priority);
create index if not exists idx_route_email on public.inbound_routing_rules(to_email);
create index if not exists idx_route_domain on public.inbound_routing_rules(to_domain);
create index if not exists idx_route_plus on public.inbound_routing_rules(plus_tag);

-- B) Optional: default campaign per connected account
alter table public.connected_accounts
  add column if not exists default_campaign_id uuid references public.campaigns(id) on delete set null;

-- C) Helper: parse email → local, domain, plus-tag
create or replace function public.parse_email_parts(p_email text)
returns table(local text, domain text, plus_tag text)
language plpgsql immutable as $$
declare
  addr text := trim(p_email);
  l text; d text; tag text;
begin
  if addr is null or addr = '' then
    return;
  end if;
  -- strip display name if present
  if addr like '%<%>%' then
    addr := regexp_replace(addr, '.*<([^>]+)>.*', '\1');
  end if;

  l := split_part(addr, '@', 1);
  d := lower(split_part(addr, '@', 2));

  if position('+' in l) > 0 then
    tag := split_part(l, '+', 2);
    l := split_part(l, '+', 1);
  end if;

  return query select lower(l), lower(d), nullif(lower(tag), '');
end
$$;

-- D) Resolver: given account + To:, pick a campaign (priority order)
create or replace function public.resolve_campaign_for_inbound(p_account uuid, p_to text)
returns uuid
language plpgsql stable as $$
declare
  parts record;
  cid uuid;
begin
  select * into parts from public.parse_email_parts(p_to);

  -- 1) Exact email match
  select r.campaign_id into cid
    from public.inbound_routing_rules r
   where r.account_id = p_account
     and r.enabled
     and r.to_email is not null
     and lower(r.to_email) = lower(p_to)
   order by r.priority asc
   limit 1;
  if cid is not null then return cid; end if;

  -- 2) Plus-tag match (user+tag@domain)
  if parts.plus_tag is not null then
    select r.campaign_id into cid
      from public.inbound_routing_rules r
     where r.account_id = p_account
       and r.enabled
       and r.plus_tag = parts.plus_tag
     order by r.priority asc
     limit 1;
    if cid is not null then return cid; end if;
  end if;

  -- 3) Domain match
  if parts.domain is not null then
    select r.campaign_id into cid
      from public.inbound_routing_rules r
     where r.account_id = p_account
       and r.enabled
       and r.to_domain = parts.domain
     order by r.priority asc
     limit 1;
    if cid is not null then return cid; end if;
  end if;

  -- 4) Campaign slug convenience (user+{slug}@…)
  if parts.plus_tag is not null then
    select c.id into cid
      from public.campaigns c
     where c.slug = parts.plus_tag;  -- if you store slugs; else remove
    if cid is not null then return cid; end if;
  end if;

  -- 5) Fallback to account default
  select default_campaign_id into cid from public.connected_accounts where id = p_account;
  return cid; -- can be null (that’s ok; thread can still exist uncategorized)
end
$$;

-- E) RLS (view/update via UI later)
alter table public.inbound_routing_rules enable row level security;

drop policy if exists "route_read_members" on public.inbound_routing_rules;
create policy "route_read_members" on public.inbound_routing_rules
  for select to authenticated
  using (exists(
    select 1 from public.connected_accounts a
    join public.campaign_members m on m.campaign_id = campaign_id
    where a.id = account_id
      and m.user_id = auth.uid()
  ));

drop policy if exists "route_write_editors" on public.inbound_routing_rules;
create policy "route_write_editors" on public.inbound_routing_rules
  for all to authenticated
  using (exists(
    select 1 from public.campaign_members m
    where m.campaign_id = campaign_id
      and m.user_id = auth.uid()
      and m.role in ('owner','editor')
  ))
  with check (exists(
    select 1 from public.campaign_members m
    where m.campaign_id = campaign_id
      and m.user_id = auth.uid()
      and m.role in ('owner','editor')
  ));


