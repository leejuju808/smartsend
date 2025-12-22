-- Block 95 QA seed: create sample experiment and variants
insert into public.ab_experiments (
  account_id,
  name,
  objective,
  min_sample,
  stop_threshold,
  explore_floor,
  notes
)
values (
  '00000000-0000-0000-0000-000000000001',
  'Cold open — CTA phrasing',
  'reply',
  40,
  0.95,
  0.1,
  'QA seed for block 95 smoke test'
)
returning id as experiment_id;

-- After running the insert above, use the returned experiment_id to seed variants manually, e.g.:
-- insert into public.ab_variants (experiment_id, label, template_text)
-- values
--   ('<experiment_id>', 'A', 'Hi {{first_name}}, ... variant A ...'),
--   ('<experiment_id>', 'B', 'Hi {{first_name}}, ... variant B ...');

-- Optionally add assignments and outcomes for quick smoke tests.

