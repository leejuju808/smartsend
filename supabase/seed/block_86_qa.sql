-- Block 86 QA seed data ------------------------------------------------------

insert into public.campaigns (id, account_id, name, status)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000001',
  'HubSpot 50+ Outreach',
  'draft'
)
on conflict (id) do nothing;

-- Saved view references reused from Block 84 seeds. After seeding, you can:
--   GET  /api/saved-views
--   GET  /api/saved-views/:id/export
--   POST /api/saved-views/:id/queue { "campaign_id": "...", "limit": 1000 }

