-- Block 130: Add segment_id to campaigns for segment-based targeting

-- 1) Add segment_id column to campaigns
alter table public.campaigns
  add column if not exists segment_id uuid
    references public.segments(id) on delete set null;

-- 2) Optional: ensure segment + account match logically
-- (not enforced as FK since segments has account_id)
create index if not exists idx_campaigns_segment_id
  on public.campaigns (segment_id);

-- 3) (Optional but nice) partial index for active campaigns using segments
create index if not exists idx_campaigns_active_with_segment
  on public.campaigns (segment_id)
  where status in ('draft','scheduled','running');












