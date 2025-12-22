-- Preflight System: Seed data (optional)
-- Light spam phrase seeds per account (customize later)

-- Only insert if accounts exist and rules don't already exist
insert into public.preflight_rules(account_id, kind, value)
select a.id, 'spam_phrase', 'quick money'
from public.accounts a
where not exists (
  select 1 from public.preflight_rules r
  where r.account_id = a.id
    and r.kind = 'spam_phrase'
    and r.value = 'quick money'
)
on conflict do nothing;

insert into public.preflight_rules(account_id, kind, value)
select a.id, 'spam_phrase', 'act now'
from public.accounts a
where not exists (
  select 1 from public.preflight_rules r
  where r.account_id = a.id
    and r.kind = 'spam_phrase'
    and r.value = 'act now'
)
on conflict do nothing;

-- Add more common spam phrases as needed
insert into public.preflight_rules(account_id, kind, value)
select a.id, 'spam_phrase', 'limited time'
from public.accounts a
where not exists (
  select 1 from public.preflight_rules r
  where r.account_id = a.id
    and r.kind = 'spam_phrase'
    and r.value = 'limited time'
)
on conflict do nothing;

insert into public.preflight_rules(account_id, kind, value)
select a.id, 'spam_phrase', 'click here'
from public.accounts a
where not exists (
  select 1 from public.preflight_rules r
  where r.account_id = a.id
    and r.kind = 'spam_phrase'
    and r.value = 'click here'
)
on conflict do nothing;














