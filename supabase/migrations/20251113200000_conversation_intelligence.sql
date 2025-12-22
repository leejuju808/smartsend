-- Block 185: Unified Conversation Intelligence Engine
-- Adds AI-powered conversation intelligence to reply_threads

-- Add intelligence fields to reply_threads table
alter table public.reply_threads
  add column if not exists ai_summary text,
  add column if not exists ai_action_items jsonb default '[]'::jsonb,
  add column if not exists ai_tone text check (ai_tone in ('positive', 'neutral', 'negative')),
  add column if not exists ai_objections jsonb default '[]'::jsonb,
  add column if not exists ai_buyer_role text check (ai_buyer_role in ('decision_maker', 'influencer', 'assistant', 'unknown')),
  add column if not exists ai_opportunity_score int default 0 check (ai_opportunity_score >= 0 and ai_opportunity_score <= 10);

-- Add indexes for fast filtering
create index if not exists idx_reply_threads_tone on public.reply_threads(ai_tone);
create index if not exists idx_reply_threads_opportunity on public.reply_threads(ai_opportunity_score);
create index if not exists idx_reply_threads_buyer_role on public.reply_threads(ai_buyer_role);

-- Comments
comment on column public.reply_threads.ai_summary is 'AI-generated summary of the conversation thread';
comment on column public.reply_threads.ai_action_items is 'Array of action items extracted from the conversation';
comment on column public.reply_threads.ai_tone is 'Overall tone of the conversation: positive, neutral, or negative';
comment on column public.reply_threads.ai_objections is 'Array of objections or concerns raised in the conversation';
comment on column public.reply_threads.ai_buyer_role is 'Detected buyer role: decision_maker, influencer, assistant, or unknown';
comment on column public.reply_threads.ai_opportunity_score is 'Opportunity score from 0-10 indicating sales potential';












