-- Block 97 QA presets for Saved View Builder

-- Hot Leads preset (Inbox scope)
insert into public.saved_views (account_id, name, scope, filters)
values (
  '00000000-0000-0000-0000-000000000001',
  'Hot Leads — meeting_intent ≥60 in 7d',
  'inbox',
  '{"intent":"meeting_intent","since_days":7,"score_min":60,"paused":false}'::jsonb
)
on conflict do nothing;

-- ICP Fit preset (Leads scope)
insert into public.saved_views (account_id, name, scope, filters)
values (
  '00000000-0000-0000-0000-000000000001',
  'ICP — HubSpot + ≥50 emp',
  'leads',
  '{"tech":"hubspot","employees_min":50,"industry_contains":"SaaS"}'::jsonb
)
on conflict do nothing;

