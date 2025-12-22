-- Block 176: Add Engagement Score to Companies
-- Computes engagement score based on email events across all leads in a company

alter table public.companies
  add column if not exists engagement_score int default 0;

-- Index for filtering by engagement score
create index if not exists idx_companies_engagement_score on public.companies(engagement_score);

-- Comment
comment on column public.companies.engagement_score is 'Total count of email events (opens, clicks, replies) across all leads in this company';












