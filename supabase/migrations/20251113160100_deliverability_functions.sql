-- Block 181: RPC Functions for Deliverability Tracking
-- Functions to increment sent/bounce/unsubscribe counters

-- Increment sent counter
create or replace function increment_sent(acc uuid, dom text)
returns void as $$
begin
  insert into public.deliverability_stats(account_id, domain, sent_24h, updated_at)
  values (acc, dom, 1, now())
  on conflict (account_id, domain)
  do update set 
    sent_24h = public.deliverability_stats.sent_24h + 1,
    updated_at = now();
end;
$$ language plpgsql security definer;

-- Increment bounce counter
create or replace function increment_bounce(acc uuid, dom text)
returns void as $$
begin
  insert into public.deliverability_stats(account_id, domain, bounces_24h, updated_at)
  values (acc, dom, 1, now())
  on conflict (account_id, domain)
  do update set 
    bounces_24h = public.deliverability_stats.bounces_24h + 1,
    updated_at = now();
end;
$$ language plpgsql security definer;

-- Increment unsubscribe counter
create or replace function increment_unsubscribe(acc uuid, dom text)
returns void as $$
begin
  insert into public.deliverability_stats(account_id, domain, unsubscribes_24h, updated_at)
  values (acc, dom, 1, now())
  on conflict (account_id, domain)
  do update set 
    unsubscribes_24h = public.deliverability_stats.unsubscribes_24h + 1,
    updated_at = now();
end;
$$ language plpgsql security definer;

-- Increment complaint counter
create or replace function increment_complaint(acc uuid, dom text)
returns void as $$
begin
  insert into public.deliverability_stats(account_id, domain, complaints_24h, updated_at)
  values (acc, dom, 1, now())
  on conflict (account_id, domain)
  do update set 
    complaints_24h = public.deliverability_stats.complaints_24h + 1,
    updated_at = now();
end;
$$ language plpgsql security definer;

-- Helper function to get deliverability stats for an account+domain
create or replace function get_deliverability_stats(acc uuid, dom text)
returns table (
  id uuid,
  account_id uuid,
  domain text,
  sent_24h int,
  bounces_24h int,
  complaints_24h int,
  unsubscribes_24h int,
  reputation_score int,
  bounce_rate_pct numeric,
  unsubscribe_rate_pct numeric
) as $$
begin
  return query
  select 
    ds.id,
    ds.account_id,
    ds.domain,
    ds.sent_24h,
    ds.bounces_24h,
    ds.complaints_24h,
    ds.unsubscribes_24h,
    ds.reputation_score,
    case 
      when ds.sent_24h > 0 then (ds.bounces_24h::numeric / ds.sent_24h::numeric * 100)
      else 0
    end as bounce_rate_pct,
    case 
      when ds.sent_24h > 0 then (ds.unsubscribes_24h::numeric / ds.sent_24h::numeric * 100)
      else 0
    end as unsubscribe_rate_pct
  from public.deliverability_stats ds
  where ds.account_id = acc and ds.domain = dom;
end;
$$ language plpgsql security definer;












