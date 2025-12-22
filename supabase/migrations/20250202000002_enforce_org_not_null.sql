-- Post-Migration Cleanup: Enforce NOT NULL on org_id columns
-- Run this after all data has been backfilled

-- WARNING: Only run this after verifying all rows have org_id set
-- You may want to add these constraints individually after confirming

-- alter table campaigns alter column org_id set not null;
-- alter table leads alter column org_id set not null;
-- alter table email_replies alter column org_id set not null;

-- Optional: Add indexes if needed
-- create index if not exists idx_campaigns_org_notnull on campaigns(org_id) where org_id is not null;
-- create index if not exists idx_leads_org_notnull on leads(org_id) where org_id is not null;
-- create index if not exists idx_email_replies_org_notnull on email_replies(org_id) where org_id is not null;

