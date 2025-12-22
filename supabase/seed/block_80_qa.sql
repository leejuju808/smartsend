-- Block 80 QA seed: synthetic sends and domain counters for smoke testing.

insert into public.email_sends (id, account_id, lead_id, to_email, preset_key, variant_id, status, created_at)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000001', gen_random_uuid(),
       x.email, 'default', gen_random_uuid(), 'sent', now() - (random() * interval '6 days')
from (values
  ('user1@gmail.com'),
  ('user2@gmail.com'),
  ('user3@gmail.com'),
  ('a@acme.com'),
  ('b@acme.com'),
  ('c@acme.com')
) as x(email);

with s as (
  select id, account_id
  from public.email_sends
  where to_email like '%@acme.com'
  limit 2
)
insert into public.email_events (id, account_id, send_id, type, created_at)
select gen_random_uuid(), account_id, id, 'bounce', now()
from s;

select public.rpc_inc_domain_counter(
  '00000000-0000-0000-0000-000000000001',
  'acme.com',
  current_date,
  42
);

