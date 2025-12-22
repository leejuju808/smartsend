-- vendor routing + secrets schema
set check_function_bodies = off;

create table if not exists public.vendor_registry (
  key text primary key,
  display_name text not null,
  enabled boolean not null default true,
  default_priority int not null default 100
);

create table if not exists public.account_vendor_routing (
  account_id uuid not null references public.accounts(id) on delete cascade,
  vendor_key text not null references public.vendor_registry(key),
  weight int not null default 100,
  priority int not null default 100,
  enabled boolean not null default true,
  primary key (account_id, vendor_key)
);

create table if not exists public.vendor_secrets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  vendor_key text not null references public.vendor_registry(key),
  name text not null default 'default',
  kv jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, vendor_key, name)
);

create index if not exists idx_account_vendor_routing_account
  on public.account_vendor_routing (account_id);

create index if not exists idx_vendor_secrets_account
  on public.vendor_secrets (account_id);

alter table public.account_vendor_routing enable row level security;
alter table public.vendor_secrets enable row level security;

create policy if not exists avr_rw on public.account_vendor_routing
  for all
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));

create policy if not exists vse_rw on public.vendor_secrets
  for all
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));

insert into public.vendor_registry (key, display_name, enabled, default_priority)
values
  ('vendor_a', 'Vendor A (demo)', true, 10),
  ('vendor_b', 'Vendor B (demo)', true, 20)
on conflict (key) do update
  set enabled = excluded.enabled,
      default_priority = excluded.default_priority,
      display_name = excluded.display_name;

create or replace function public.pick_enrichment_vendor()
returns text
language plpgsql
stable
as $$
declare
  v_account uuid := current_setting('app.account_id', true)::uuid;
  total int;
  r int;
  v text;
begin
  if v_account is null then
    select key
    into v
    from public.vendor_registry
    where enabled
    order by default_priority asc
    limit 1;
    return v;
  end if;

  select sum(weight)
  into total
  from public.account_vendor_routing
  where account_id = v_account
    and enabled;

  if total is null or total <= 0 then
    select key
    into v
    from public.vendor_registry
    where enabled
    order by default_priority asc
    limit 1;
    return v;
  end if;

  r := floor(random() * total)::int + 1;

  return (
    with ordered as (
      select
        vendor_key,
        weight,
        sum(weight) over (order by priority, vendor_key) as cum
      from public.account_vendor_routing
      where account_id = v_account
        and enabled
      order by priority, vendor_key
    )
    select vendor_key
    from ordered
    where cum >= r
    order by cum asc
    limit 1
  );
end;
$$;

