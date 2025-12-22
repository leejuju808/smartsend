-- A) Rewrites generated for classified replies
create table if not exists public.reply_rewrites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  thread_id uuid references public.inbox_threads(id) on delete cascade,
  message_id uuid references public.normalized_messages(id) on delete cascade,
  reply_label text not null,           -- e.g. 'positive','question','neutral','routing'
  subject text not null,
  body text not null,
  ai_version text default 'v1',
  approved boolean default false,
  unique(thread_id, message_id)
);

create index if not exists idx_reply_rewrites_thread on public.reply_rewrites(thread_id);
create index if not exists idx_reply_rewrites_label on public.reply_rewrites(reply_label);

-- B) Convenience view: latest rewrite per thread
create or replace view public.v_last_rewrite as
select distinct on (thread_id)
  thread_id, subject, body, reply_label, created_at
from public.reply_rewrites
order by thread_id, created_at desc;

-- C) Feature flag (if not exists)
insert into public.feature_flags(key, enabled)
values ('template_rewriter_enabled', false)
on conflict (key) do nothing;

