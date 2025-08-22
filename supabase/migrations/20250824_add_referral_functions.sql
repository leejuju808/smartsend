-- RPC: atomic increment of credit months for inviter
create or replace function public.add_credit_month(p_user_id uuid, p_delta int)
returns void
language sql
as $$
  update public.profiles
  set credit_months = coalesce(credit_months, 0) + p_delta
  where id = p_user_id;
$$;

-- RPC: referral stats summary for inviter
create or replace function public.referral_stats(p_inviter uuid)
returns table(invited bigint, joined bigint, converted bigint)
language sql stable
as $$
  select
    count(*) filter (where status in ('pending','joined','converted')) as invited,
    count(*) filter (where status = 'joined') as joined,
    count(*) filter (where status = 'converted') as converted
  from public.referrals
  where user_id = p_inviter;
$$;

