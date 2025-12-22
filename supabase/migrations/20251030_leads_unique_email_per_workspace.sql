-- Leads guardrails: enforce unique email per workspace and helpful created_at index

-- 1) Reject duplicate emails inside the same workspace (case-insensitive)
create unique index if not exists leads_workspace_email_unique
on public.leads (workspace_id, lower(email));

-- 2) Helpful index for recency filters (e.g., added in last 7 days)
create index if not exists leads_created_at_idx on public.leads (created_at);

-- If you have an older unique index on email only, drop it and keep the workspace-scoped one above.
-- Example (adjust name if different):
-- drop index if exists leads_email_key;


