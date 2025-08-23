-- materialized view of active domains (last 30d)
create materialized view if not exists public.recent_domain_signups as
select split_part(p.email, '@', 2) as domain,
       count(*) as users_30d,
       min(p.created_at) as first_seen,
       max(p.created_at) as last_seen
from public.profiles p
where p.created_at > now() - interval '30 days'
  and split_part(p.email, '@', 2) not in ('gmail.com','yahoo.com','outlook.com','icloud.com','hotmail.com')
group by 1;

create index if not exists idx_recent_domain_signups_domain on public.recent_domain_signups(domain);

-- fast refresh function
create or replace function public.refresh_recent_domain_signups()
returns void language sql as $$ refresh materialized view public.recent_domain_signups; $$;

-- function for domains to notify
create or replace function domains_to_notify()
returns table(domain text, users_30d int, owner_id uuid, owner_email text)
language sql as $$
  with hot as (
    select r.domain, r.users_30d
    from recent_domain_signups r
    left join company_domains cd on cd.domain = r.domain and cd.verified = true
    where cd.domain is null and r.users_30d >= 3
  ),
  owner as (
    select p2.id as owner_id, p2.email as owner_email, split_part(p2.email,'@',2) as domain
    from profiles p2
    where p2.subscription_status = 'pro'
  )
  select h.domain, h.users_30d, o.owner_id, o.owner_email
  from hot h
  join owner o on o.domain = h.domain
$$; 