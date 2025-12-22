-- Seed a test campaign
insert into public.campaigns (id, name, status)
values (gen_random_uuid(), 'Test Campaign — Import & Retry', 'draft')
returning id;

-- After grabbing campaign_id, create a few failed leads for Retry button checks:
-- Replace :campaign_id with the UUID returned above
insert into public.leads (campaign_id, email, first_name, last_name, company, status, attempts, max_attempts)
values
  (:campaign_id, 'fail1@example.com', 'Fail', 'One', 'Acme', 'failed', 1, 3),
  (:campaign_id, 'fail2@example.com', 'Fail', 'Two', 'Acme', 'failed', 2, 3),
  (:campaign_id, 'maxed@example.com', 'Max', 'Out', 'Acme', 'failed', 3, 3);

