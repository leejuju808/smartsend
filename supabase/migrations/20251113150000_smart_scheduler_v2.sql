-- Block 180: Smart Scheduler v2 - Add sending controls to campaigns
-- AI-Optimized Send Windows + Domain Warm-Up Logic + Safety Throttling

alter table public.campaigns
  add column if not exists send_window_start time default '08:00',
  add column if not exists send_window_end time default '17:00',
  add column if not exists daily_cap int default 150,
  add column if not exists throttle_per_minute int default 3,
  add column if not exists warmup_mode boolean default false;

-- Indexes for efficient querying
create index if not exists idx_campaigns_send_window on public.campaigns(send_window_start, send_window_end);
create index if not exists idx_campaigns_warmup_mode on public.campaigns(warmup_mode) where warmup_mode = true;

-- Comments
comment on column public.campaigns.send_window_start is 'Start time for sending window (local timezone)';
comment on column public.campaigns.send_window_end is 'End time for sending window (local timezone)';
comment on column public.campaigns.daily_cap is 'Maximum emails to send per day for this campaign';
comment on column public.campaigns.throttle_per_minute is 'Maximum emails to send per minute for this campaign';
comment on column public.campaigns.warmup_mode is 'Enable domain warmup ramp-up logic';












