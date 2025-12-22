-- Block 84 — Seed default ICP Fit saved view
insert into public.saved_views (account_id, name, description, filter, columns, sort, is_default)
values (
  '00000000-0000-0000-0000-000000000001',
  'ICP Fit — SaaS on HubSpot + >50',
  'Companies using HubSpot with 50+ employees; industry contains "SaaS".',
  jsonb_build_object(
    'and', jsonb_build_array(
      jsonb_build_object('k', 'company_tech', 'op', 'has', 'v', 'HubSpot'),
      jsonb_build_object('k', 'company_size', 'op', '>=', 'v', '50'),
      jsonb_build_object(
        'or',
        jsonb_build_array(
          jsonb_build_object('k', 'company_industry', 'op', 'ilike', 'v', '%saas%'),
          jsonb_build_object('k', 'tags', 'op', '@>', 'v', jsonb_build_array('SaaS'))
        )
      )
    )
  ),
  jsonb_build_array('display_name', 'email', 'company_name', 'company_size', 'company_industry', 'company_tech', 'last_contacted_at'),
  '{"key":"updated_at","dir":"desc"}'::jsonb,
  false
)
on conflict (account_id, name) do update
set description = excluded.description,
    filter = excluded.filter,
    columns = excluded.columns,
    sort = excluded.sort;

