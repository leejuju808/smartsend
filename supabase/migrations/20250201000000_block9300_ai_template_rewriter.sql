-- Block 9300 — SmartSend Template Rewriter v1 (AI-Powered Subject + Body Rewrites)
-- Optional log table for AI rewrites (analytics + undo)

create table if not exists public.smartsend_ai_rewrite_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  step_position int,
  target text not null check (target in ('subject', 'body')),
  tone text,
  goal text,
  original_text text not null,
  rewritten_text text not null,
  created_at timestamptz default now()
);

create index if not exists idx_smartsend_ai_rewrite_logs_user_campaign 
  on public.smartsend_ai_rewrite_logs (user_id, campaign_id);

create index if not exists idx_smartsend_ai_rewrite_logs_created_at 
  on public.smartsend_ai_rewrite_logs (created_at desc);

-- Enable RLS
alter table public.smartsend_ai_rewrite_logs enable row level security;

-- RLS policy: users can only see their own rewrite logs
create policy smartsend_ai_rewrite_logs_select_own 
  on public.smartsend_ai_rewrite_logs 
  for select 
  using (auth.uid() = user_id);

create policy smartsend_ai_rewrite_logs_insert_own 
  on public.smartsend_ai_rewrite_logs 
  for insert 
  with check (auth.uid() = user_id);


































































