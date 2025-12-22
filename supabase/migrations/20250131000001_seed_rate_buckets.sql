-- Seed sensible defaults for token buckets
-- Applies Gmail/Outlook defaults to all connected accounts

-- Gmail defaults: capacity 100, refill 2/sec (≈120/min)
insert into public.send_rate_buckets (account_id, provider, capacity, refill_per_sec, tokens)
select a.id, 'gmail', 100, 2, 100 
from public.accounts a
where a.provider = 'gmail'
on conflict (account_id, provider) do nothing;

-- Outlook defaults: capacity 60, refill 1/sec (≈60/min)
insert into public.send_rate_buckets (account_id, provider, capacity, refill_per_sec, tokens)
select a.id, 'outlook', 60, 1, 60 
from public.accounts a
where a.provider = 'outlook'
on conflict (account_id, provider) do nothing;















