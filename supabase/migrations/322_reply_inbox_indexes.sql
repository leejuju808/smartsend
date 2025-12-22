-- Block 322 — Replies Inbox Filters v1
-- Speed up common filters on reply_logs for inbox

create index if not exists reply_logs_workspace_idx
  on reply_logs (workspace_id);

create index if not exists reply_logs_workspace_campaign_idx
  on reply_logs (workspace_id, campaign_id);

create index if not exists reply_logs_workspace_lead_idx
  on reply_logs (workspace_id, lead_id);

create index if not exists reply_logs_workspace_category_idx
  on reply_logs (workspace_id, ai_category);

create index if not exists reply_logs_workspace_received_at_idx
  on reply_logs (workspace_id, received_at desc);







