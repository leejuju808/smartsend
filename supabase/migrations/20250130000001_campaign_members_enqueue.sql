-- A) Campaign members (lead→campaign link)

create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  meta jsonb default '{}'::jsonb,
  unique (campaign_id, lead_id)
);

create index if not exists idx_cm_campaign on public.campaign_members(campaign_id);
create index if not exists idx_cm_lead on public.campaign_members(lead_id);

-- B) Minimal send_queue (if not already present)
-- Note: send_queue may already exist, but ensure it has required columns
do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'send_queue') then
    create table public.send_queue (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      campaign_id uuid not null references public.campaigns(id) on delete cascade,
      lead_id uuid not null references public.leads(id) on delete cascade,
      step_no int not null,
      scheduled_for timestamptz not null,
      status text not null default 'queued' check (status in ('queued','dispatched','sent','failed','canceled')),
      last_error text
    );
  end if;

  -- Ensure required columns exist
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'send_queue' and column_name = 'step_no') then
    alter table public.send_queue add column step_no int not null default 1;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'send_queue' and column_name = 'scheduled_for') then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'send_queue' and column_name = 'scheduled_at') then
      alter table public.send_queue rename column scheduled_at to scheduled_for;
    else
      alter table public.send_queue add column scheduled_for timestamptz not null default now();
    end if;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'send_queue' and column_name = 'status') then
    alter table public.send_queue add column status text not null default 'queued';
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'send_queue' and column_name = 'last_error') then
    alter table public.send_queue add column last_error text;
  end if;
end $$;

create index if not exists idx_sq_sched on public.send_queue(status, scheduled_for);
create index if not exists idx_sq_campaign on public.send_queue(campaign_id);

-- C) Helper: enqueue step 1 for many leads (skips unsub/suppressed; respects mailbox windowing)
create or replace function public.enqueue_step1_for_leads(
  p_campaign uuid,
  p_leads uuid[],
  p_base timestamptz default now(),
  p_include_jitter boolean default false
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cnt int := 0;
  v_step1 int;
  r uuid;
  v_sched_e timestamptz;
begin
  -- find step 1 exists & enabled
  select step_no into v_step1
  from public.campaign_steps
  where campaign_id = p_campaign and step_no = 1 and enabled
  limit 1;

  if v_step1 is null then
    raise exception 'step 1 not found/enabled for campaign %', p_campaign;
  end if;

  foreach r in array p_leads loop
    -- skip unsubscribed/suppressed
    continue when exists (
      select 1 from public.leads l
      where l.id = r and (coalesce(l.unsubscribed,false) or coalesce(l.suppressed,false))
    );

    -- compute earliest schedule using preview fn (deterministic)
    select scheduled_at_earliest
      into v_sched_e
    from public.preview_next_send_for_step(p_campaign, 1, r, p_base, p_include_jitter)
    limit 1;

    if v_sched_e is null then
      -- fallback: schedule now
      v_sched_e := p_base;
    end if;

    -- insert queue row if not already queued for step 1
    -- Check if already exists to avoid conflicts
    if not exists (
      select 1 from public.send_queue
      where campaign_id = p_campaign and lead_id = r and step_no = 1
    ) then
      insert into public.send_queue (campaign_id, lead_id, step_no, scheduled_for, status)
      values (p_campaign, r, 1, v_sched_e, 'queued');
      v_cnt := v_cnt + 1;
    end if;
  end loop;

  return v_cnt;
end;
$$;

-- Grant execute permissions
grant execute on function public.enqueue_step1_for_leads to authenticated;
grant execute on function public.enqueue_step1_for_leads to service_role;

-- RLS for campaign_members
alter table public.campaign_members enable row level security;

create policy "Users can view campaign members for their campaigns"
  on public.campaign_members for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_members.campaign_id
      and (c.user_id = auth.uid() or exists (
        select 1 from public.campaign_shares cs
        where cs.campaign_id = c.id and cs.user_id = auth.uid()
      ))
    )
  );

create policy "Users can insert campaign members for their campaigns"
  on public.campaign_members for insert
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_members.campaign_id
      and (c.user_id = auth.uid() or exists (
        select 1 from public.campaign_shares cs
        where cs.campaign_id = c.id and cs.user_id = auth.uid() and cs.role in ('editor', 'owner')
      ))
    )
  );

