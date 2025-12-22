-- Block 354: Seed default daily_reply_cap (optional)
-- Set a default daily_reply_cap where missing (example: 200 replies/day)
-- 
-- If you prefer "unlimited replies" on current plans, skip this migration
-- and only set daily_reply_cap for specific workspaces.

update workspace_billing_limits
set daily_reply_cap = 200
where daily_reply_cap is null;





