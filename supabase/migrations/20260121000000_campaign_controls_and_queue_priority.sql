-- Campaign controls and queue priority system
-- Adds pause/resume, cancel queued, and priority boosting

-- Campaign states: draft | active | paused | completed | archived
alter table public.campaigns
  add column if not exists status text check (status in ('draft','active','paused','completed','archived')) default 'draft';

-- Queue controls
alter table public.send_queue
  add column if not exists priority int not null default 0,        -- higher = earlier
  add column if not exists canceled_at timestamptz,                -- null means live
  add column if not exists canceled_by uuid references auth.users(id);

-- Helpful indexes
create index if not exists idx_queue_live on public.send_queue(status, canceled_at, scheduled_at, priority desc);
create index if not exists idx_campaign_status on public.campaigns(status);

-- Update existing RLS policies to handle new columns
-- RLS already restricts by user/team; these new columns inherit that.

