-- =========================================================
-- Block 8610 — Lead Outcomes + Revenue Tracking
-- =========================================================
-- Add fields to mark leads Won / Lost and track actual job value
-- This enables revenue tracking: "How many jobs did SmartSend help us win, and how much revenue did that bring in?"

-- 1) Add outcome tracking columns to leads table
alter table public.leads
  add column if not exists outcome text null check (outcome in ('won', 'lost'));

alter table public.leads
  add column if not exists won_value numeric(12,2) null;

alter table public.leads
  add column if not exists won_at timestamptz null;

alter table public.leads
  add column if not exists lost_reason text null;

-- 2) Create index for efficient queries on outcome and won_at
create index if not exists idx_leads_outcome_won_at
  on public.leads(outcome, won_at)
  where outcome = 'won' and won_at is not null;

-- 3) Add comments for documentation
comment on column public.leads.outcome is 'Lead outcome: ''won'' | ''lost'' | null';
comment on column public.leads.won_value is 'Actual contract value when lead is marked as won (in dollars)';
comment on column public.leads.won_at is 'Timestamp when the lead was marked as won';
comment on column public.leads.lost_reason is 'Optional reason why the lead was lost (e.g., "chose competitor", "no budget", etc.)';

























































