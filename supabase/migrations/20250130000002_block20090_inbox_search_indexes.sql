-- Block 20090 — Inbox Search Indexes
-- Indexes for faster search on inbox_threads table

CREATE INDEX IF NOT EXISTS idx_inbox_homeowner_email
ON inbox_threads (homeowner_email);

CREATE INDEX IF NOT EXISTS idx_inbox_homeowner_name
ON inbox_threads (homeowner_name);

CREATE INDEX IF NOT EXISTS idx_inbox_lead_stage
ON inbox_threads (lead_stage);

CREATE INDEX IF NOT EXISTS idx_inbox_assigned_to
ON inbox_threads (assigned_to_user_id);

-- Index for property_address search
CREATE INDEX IF NOT EXISTS idx_inbox_property_address
ON inbox_threads (property_address);

-- Index for last_message_preview search (text search)
CREATE INDEX IF NOT EXISTS idx_inbox_last_message_preview
ON inbox_threads (last_message_preview);

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_inbox_lead_stage_engagement
ON inbox_threads (lead_stage, engagement_level);

-- Index for insurance claims filter
CREATE INDEX IF NOT EXISTS idx_inbox_insurance_claim
ON inbox_threads (has_insurance_claim) WHERE has_insurance_claim = true;

















































