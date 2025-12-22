-- Follow-up helpers and reply drafts (2025-11-07)

-- Safe task claimer
create or replace function public.claim_followup_tasks(p_limit int default 30)
returns setof public.followup_tasks
language sql
security definer
set search_path = public
as $$
  with c as (
    select id
    from public.followup_tasks
    where status = 'queued'
      and run_at <= now()
    order by run_at asc
    limit p_limit
    for update skip locked
  )
  update public.followup_tasks t
     set status = 'working',
         attempts = t.attempts + 1
   where t.id in (select id from c)
  returning t.*;
$$;

revoke all on function public.claim_followup_tasks(int) from public;
grant execute on function public.claim_followup_tasks(int) to authenticated;


-- Follow-up rules policies
alter table if exists public.followup_rules enable row level security;

drop policy if exists "read_rules_members" on public.followup_rules;
create policy "read_rules_members" on public.followup_rules
  for select to authenticated
  using (public.is_campaign_viewer(campaign_id));

drop policy if exists "write_rules_editors" on public.followup_rules;
create policy "write_rules_editors" on public.followup_rules
  for insert to authenticated
  with check (public.is_campaign_editor(campaign_id));

drop policy if exists "update_rules_editors" on public.followup_rules;
create policy "update_rules_editors" on public.followup_rules
  for update to authenticated
  using (public.is_campaign_editor(campaign_id));


-- Reply drafts store
create table if not exists public.reply_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  subject text not null,
  body_html text not null,
  source text not null default 'ui',
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_reply_drafts_thread on public.reply_drafts(thread_id);


-- Helpful index for inbound lookup
create index if not exists idx_nm_thread_dir_time
  on public.normalized_messages(linked_thread_id, direction, sent_at desc);

