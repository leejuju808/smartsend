-- Block 186: Autonomous Follow-Up Brain
-- Adds auto-followup settings to campaigns table

alter table public.campaigns
  add column if not exists auto_followup boolean default false,
  add column if not exists followup_approval_required boolean default false;

-- Index for faster lookups
create index if not exists idx_campaigns_auto_followup on public.campaigns(auto_followup) where auto_followup = true;

-- Comments
comment on column public.campaigns.auto_followup is 'Enable autonomous AI-generated follow-ups based on thread context';
comment on column public.campaigns.followup_approval_required is 'Require manual approval before sending auto-generated follow-ups';












