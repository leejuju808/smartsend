-- A) Store model/cost metadata on messages (optional but handy)
alter table public.inbox_messages
  add column if not exists ai_model text,
  add column if not exists ai_tokens_prompt int,
  add column if not exists ai_tokens_completion int,
  add column if not exists ai_cost_usd numeric;

-- B) Lightweight queue (so you can inspect/retry)
create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  status text not null check (status in ('queued','running','done','error')) default 'queued',

  job_type text not null check (job_type in ('reply_classify')),
  message_id uuid references public.inbox_messages(id) on delete cascade,

  model text,
  error text
);

create index if not exists idx_ai_jobs_status on public.ai_jobs(status, created_at);
create index if not exists idx_ai_jobs_message on public.ai_jobs(message_id);
create index if not exists idx_ai_jobs_type on public.ai_jobs(job_type, status);

-- Unique constraint to prevent duplicate jobs for the same message (only for queued/running)
create unique index if not exists uq_ai_jobs_type_message on public.ai_jobs(job_type, message_id) where status in ('queued', 'running');

-- C) Enqueue helper (messages needing LLM)
create or replace function public.enqueue_ai_for_unclassified(p_limit int default 200)
returns int
language plpgsql security definer
as $$
declare r record; v int := 0; begin
  for r in
    select id from public.inbox_messages
    where direction='inbound' and ai_label is null
      and not exists (
        select 1 from public.ai_jobs
        where job_type = 'reply_classify' and message_id = inbox_messages.id and status in ('queued', 'running')
      )
    order by created_at desc
    limit p_limit
  loop
    insert into public.ai_jobs (job_type, message_id)
    values ('reply_classify', r.id);
    v := v + 1;
  end loop;
  return v;
end $$;

grant execute on function public.enqueue_ai_for_unclassified(int) to service_role;

-- RLS for ai_jobs (service role only for writes, users can read their own via message linkage)
alter table public.ai_jobs enable row level security;

-- Users can read jobs for messages they can see
drop policy if exists ai_jobs_select on public.ai_jobs;
create policy ai_jobs_select on public.ai_jobs
  for select using (
    exists (
      select 1 from public.inbox_messages m
      join public.inbox_threads t on t.id = m.thread_id
      join public.campaigns c on c.id = t.campaign_id
      where m.id = ai_jobs.message_id
      and c.user_id = auth.uid()
    ) or exists (
      select 1 from public.inbox_messages m
      join public.inbox_threads t on t.id = m.thread_id
      join public.connected_accounts ca on ca.id = t.account_id
      where m.id = ai_jobs.message_id
      and ca.user_id = auth.uid()
    )
  );

-- Only service role can write
revoke all on table public.ai_jobs from anon, authenticated;
grant all on table public.ai_jobs to service_role;

