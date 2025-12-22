-- Two similar leads on same domain
insert into public.leads (id, account_id, email, first_name, last_name, company_name, title, employee_count)
values
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'alex@acme.com', 'Alex', 'Stone', 'Acme Inc', 'Head of Ops', 120),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'a.stone@acme.com', 'Alexander', 'Stone', 'Acme Incorporated', 'Operations Director', 120);

-- Generate candidates
select public.rpc_generate_lead_match_candidates('00000000-0000-0000-0000-000000000001', 50);

