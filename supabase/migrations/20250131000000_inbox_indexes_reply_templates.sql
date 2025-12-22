-- A) Speed up inbox queries

create index if not exists idx_threads_campaign_lead on public.inbox_threads(campaign_id, lead_id);

create index if not exists idx_threads_updated_replied on public.inbox_threads(updated_at desc, replied_at);

create index if not exists idx_messages_thread_created on public.inbox_messages(thread_id, created_at desc);

create index if not exists idx_messages_ai_label on public.inbox_messages(ai_label);

-- B) Last inbound label per thread (view)

create or replace view public.v_thread_last_inbound as
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  max(m.created_at) as last_inbound_at,
  (array_agg(m.ai_label order by m.created_at desc))[1] as last_label,
  (array_agg(m.ai_confidence order by m.created_at desc))[1] as last_confidence
from public.inbox_threads t
join public.inbox_messages m on m.thread_id = t.id and m.direction = 'inbound'
group by 1,2,3;

-- C) Canned reply templates (per user)

create table if not exists public.reply_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  body_html text not null,
  is_default boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_reply_templates_user on public.reply_templates(user_id);

-- D) Minimal default rows (idempotent)

insert into public.reply_templates (user_id, name, body_html, is_default)
select u.id, 'Book a call', '<p>Great to hear from you! Here''s my calendar: <a href="https://cal.com/you">Book a time</a>.</p>', true
from auth.users u
where not exists (select 1 from public.reply_templates rt where rt.user_id = u.id)
on conflict do nothing;

-- E) Resume campaign helper: flip flag + (optional) enqueue next step

create or replace function public.resume_campaign_for_thread(p_thread uuid, p_enqueue_next boolean default false)
returns int
language plpgsql
security definer
as $$
declare
  v_campaign uuid;
  v_lead uuid;
  v_next int;
  v_count int := 0;
begin
  select campaign_id, lead_id into v_campaign, v_lead from public.inbox_threads where id = p_thread;
  if v_campaign is null or v_lead is null then return 0; end if;

  update public.inbox_threads
     set stopped_by_reply = false
   where id = p_thread;

  if p_enqueue_next then
    -- Find the highest sent step for this (campaign, lead)
    select coalesce(max(step_no), 0) into v_next
    from public.send_logs
    where campaign_id = v_campaign and lead_id = v_lead and status = 'sent';

    -- Enqueue the immediate next step if exists
    if exists (select 1 from public.campaign_steps where campaign_id = v_campaign and step_no = v_next + 1 and enabled) then
      perform public.enqueue_step1_for_leads_with_rules(v_campaign, v_next + 1, array[v_lead]::uuid[], now(), true);
      v_count := 1;
    end if;
  end if;

  return v_count;
end $$;

-- RLS for reply_templates

alter table public.reply_templates enable row level security;

create policy "Users can view own templates" on public.reply_templates
  for select using (auth.uid() = user_id);

create policy "Users can insert own templates" on public.reply_templates
  for insert with check (auth.uid() = user_id);

create policy "Users can update own templates" on public.reply_templates
  for update using (auth.uid() = user_id);

create policy "Users can delete own templates" on public.reply_templates
  for delete using (auth.uid() = user_id);

