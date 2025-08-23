-- Create Slack integration tables
create table if not exists public.slack_tokens (
  team_id uuid primary key,          -- your app team_id
  access_token text not null,        -- xoxb-...
  bot_user_id text,
  workspace_id text,                 -- Slack team id (T123…)
  workspace_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.slack_settings (
  team_id uuid primary key,
  channel_id text,                   -- where to post
  post_meeting boolean default true,
  post_low_credits boolean default true,
  post_weekly_digest boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add RLS policies if needed
alter table public.slack_tokens enable row level security;
alter table public.slack_settings enable row level security; 