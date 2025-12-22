-- Block 99 QA harness seeds
-- Executes the scheduler QA helper functions to validate caps, backoff, and quiet hour predicates.

\set acct '00000000-0000-0000-0000-000000000001'

select qa.reset_account(:'acct');
select qa.seed_scheduler_matrix(:'acct', '{"gmail":20,"outlook":20,"yahoo":6,"other":6}'::jsonb);

-- Case A: Healthy reputation, modest caps → should be limited by ISP caps only
select qa.set_isp_caps(:'acct', '{"gmail_hourly":5,"outlook_hourly":4,"yahoo_hourly":2,"other_hourly":3}'::jsonb);
select qa.set_domain_rep(:'acct', 'acme.com', 3, 0.80, 100, 800, 0);
select qa.set_domain_rep(:'acct', 'contoso.com', 3, 0.80, 100, 800, 0);
select qa.set_domain_rep(:'acct', 'yahoo-test.com', 3, 0.80, 100, 800, 0);

select qa.scheduler_probe_counts(:'acct') as actual \gset
select qa.expect_counts(5, 4, 2, 3, :'actual') as case_a_expect;

-- Case B: Gmail domain in backoff → expect zero gmail candidates
select qa.set_domain_rep(:'acct', 'acme.com', 3, 0.80, 100, 800, 3600);
select qa.scheduler_probe_counts(:'acct') as actual_b \gset
select qa.expect_counts(0, 4, 2, 3, :'actual_b') as case_b_expect;

-- Case C: Bounce spike triggers cooldown on Outlook (requires deliverability cron/job)
select qa.sim_outcomes(:'acct', 'contoso.com', 100, 5, 0);
-- Call the domain reputation update job/function here before re-running probe to verify cooldown.

