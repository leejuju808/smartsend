
-- Ensure generic activities log exists (used by reply triggers)
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  thread_id uuid references public.reply_threads(id) on delete cascade,
  identity_id uuid references public.send_identities(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_activities_account on public.activities(account_id, created_at desc);
create index if not exists idx_activities_lead on public.activities(lead_id, created_at desc);
create index if not exists idx_activities_thread on public.activities(thread_id, created_at desc);

alter table public.activities enable row level security;

do $$
begin
  create policy if not exists activities_rw on public.activities
    for all using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception when duplicate_object then null;
end $$;

-- Ensure the reply threads table matches the latest contract
create table if not exists public.reply_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  identity_id uuid references public.send_identities(id) on delete set null,
  status text not null default 'open' check (status in ('open','snoozed','closed')),
  owner_id uuid references auth.users(id) on delete set null,
  last_message_at timestamptz,
  last_label text,
  unread_count int not null default 0,
  unique (account_id, lead_id, campaign_id)
);

create index if not exists idx_reply_threads_owner
  on public.reply_threads (account_id, owner_id, status);

-- Link inbound messages to reply threads
alter table public.inbound_messages
  add column if not exists thread_id uuid references public.reply_threads(id) on delete set null;

-- SLA policy definition per account
create table if not exists public.reply_sla_policies (
  account_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  first_response_minutes int not null default 240,
  business_hours jsonb not null default '{"start":9,"end":17,"days":["Mon","Tue","Wed","Thu","Fri"],"tz":"America/Los_Angeles"]'::jsonb
);

-- SLA state per thread
create table if not exists public.reply_sla_states (
  thread_id uuid primary key references public.reply_threads(id) on delete cascade,
  updated_at timestamptz not null default now(),
  first_due_at timestamptz,
  first_met_at timestamptz
);

-- Ensure breached column matches generated definition
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reply_sla_states'
      and column_name = 'breached'
  ) then
    begin
      alter table public.reply_sla_states drop column breached;
    exception
      when undefined_column then null;
    end;
  end if;
end $$;

alter table public.reply_sla_states
  add column if not exists breached boolean
  generated always as (
    first_met_at is null
    and first_due_at is not null
    and now() > first_due_at
  ) stored;

create index if not exists idx_reply_sla_breach
  on public.reply_sla_states(breached);

-- Lightweight thread tasks
create table if not exists public.reply_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.reply_threads(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  assignee_id uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open','done','cancelled'))
);

create index if not exists idx_reply_tasks_assignee
  on public.reply_tasks(account_id, assignee_id, status, due_at);

-- Alert channels per account
create table if not exists public.alert_channels (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('slack_webhook','email')),
  target text not null,
  is_active boolean not null default true
);

create index if not exists idx_alert_channels_acct
  on public.alert_channels(account_id, kind, is_active);

-- Assignment cursor helper
create table if not exists public.assignment_cursors (
  account_id uuid primary key references auth.users(id) on delete cascade,
  last_owner_id uuid references auth.users(id) on delete set null
);

-- RLS -----------------------------------------------------------------------
alter table public.reply_threads enable row level security;
alter table public.reply_sla_policies enable row level security;
alter table public.reply_sla_states enable row level security;
alter table public.reply_tasks enable row level security;
alter table public.alert_channels enable row level security;

do $$
begin
  create policy if not exists threads_rw on public.reply_threads
    for all using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy if not exists sla_pol_rw on public.reply_sla_policies
    for all using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy if not exists sla_states_r on public.reply_sla_states
    for select using (
      exists (
        select 1
        from public.reply_threads t
        where t.id = thread_id
          and t.account_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy if not exists tasks_rw on public.reply_tasks
    for all using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy if not exists alerts_rw on public.alert_channels
    for all using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception when duplicate_object then null;
end $$;

-- Utility triggers for updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists reply_threads_set_updated_at on public.reply_threads;
create trigger reply_threads_set_updated_at
before update on public.reply_threads
for each row execute function public.set_updated_at();

drop trigger if exists reply_sla_states_set_updated_at on public.reply_sla_states;
create trigger reply_sla_states_set_updated_at
before update on public.reply_sla_states
for each row execute function public.set_updated_at();

drop trigger if exists reply_tasks_set_updated_at on public.reply_tasks;
create trigger reply_tasks_set_updated_at
before update on public.reply_tasks
for each row execute function public.set_updated_at();

-- Business-hours helper ------------------------------------------------------
create or replace function public.add_business_minutes(
  p_start timestamptz,
  p_minutes int,
  p_policy jsonb
) returns timestamptz
language plpgsql
immutable
as $$
declare
  v_tz text := coalesce(p_policy->>'tz', 'America/Los_Angeles');
  v_start_hour int := coalesce((p_policy->>'start')::int, 9);
  v_end_hour   int := coalesce((p_policy->>'end')::int, 17);
  v_days jsonb := coalesce(p_policy->'days', '["Mon","Tue","Wed","Thu","Fri"]'::jsonb);
  v_local timestamptz := p_start at time zone v_tz;
  v_left int := coalesce(p_minutes, 0);
  v_day_name text;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_use int;
begin
  if v_left <= 0 then
    return p_start;
  end if;

  while v_left > 0 loop
    v_day_name := case extract(isodow from v_local)
      when 1 then 'Mon'
      when 2 then 'Tue'
      when 3 then 'Wed'
      when 4 then 'Thu'
      when 5 then 'Fri'
      when 6 then 'Sat'
      else 'Sun'
    end;

    if v_day_name = any(select jsonb_array_elements_text(v_days)) then
      v_slot_start := date_trunc('day', v_local) + make_interval(hours => v_start_hour);
      v_slot_end   := date_trunc('day', v_local) + make_interval(hours => v_end_hour);

      if v_local < v_slot_start then
        v_local := v_slot_start;
      end if;

      if v_local < v_slot_end then
        v_use := least(
          v_left,
          greatest(0, extract(epoch from (v_slot_end - v_local))::int / 60)
        );

        if v_use > 0 then
          v_local := v_local + make_interval(mins => v_use);
          v_left := v_left - v_use;
        end if;
      end if;
    end if;

    exit when v_left <= 0;

    v_local := date_trunc('day', v_local) + interval '1 day' + make_interval(hours => v_start_hour);
  end loop;

  return v_local at time zone v_tz at time zone 'UTC';
end $$;

-- Thread routing -------------------------------------------------------------
create or replace function public.route_inbound_to_thread(p_inbound_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_inbound public.inbound_messages%rowtype;
  v_thread uuid;
  v_policy public.reply_sla_policies%rowtype;
begin
  select * into v_inbound
  from public.inbound_messages
  where id = p_inbound_id;

  if not found then
    return null;
  end if;

  if v_inbound.account_id is null or v_inbound.lead_id is null then
    return null;
  end if;

  insert into public.reply_threads(
    account_id,
    lead_id,
    campaign_id,
    identity_id,
    last_message_at,
    unread_count
  )
  values (
    v_inbound.account_id,
    v_inbound.lead_id,
    v_inbound.campaign_id,
    v_inbound.identity_id,
    v_inbound.received_at,
    1
  )
  on conflict (account_id, lead_id, campaign_id) do update
    set updated_at = now(),
        last_message_at = greatest(excluded.last_message_at, public.reply_threads.last_message_at),
        unread_count = coalesce(public.reply_threads.unread_count, 0) + 1,
        status = 'open'
  returning id into v_thread;

  update public.inbound_messages
    set thread_id = v_thread
  where id = p_inbound_id;

  select * into v_policy
  from public.reply_sla_policies
  where account_id = v_inbound.account_id;

  if found and coalesce(v_policy.first_response_minutes, 0) > 0 then
    insert into public.reply_sla_states(thread_id, first_due_at)
    values (
      v_thread,
      public.add_business_minutes(
        v_inbound.received_at,
        v_policy.first_response_minutes,
        v_policy.business_hours
      )
    )
    on conflict (thread_id) do nothing;
  end if;

  return v_thread;
end $$;

-- Auto assignment ------------------------------------------------------------
create or replace function public.auto_assign_owner(
  p_thread uuid,
  p_label text default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_account uuid;
  v_owner uuid;
begin
  select account_id, owner_id
    into v_account, v_owner
  from public.reply_threads
  where id = p_thread;

  if v_account is null then
    return null;
  end if;

  if v_owner is not null then
    return v_owner;
  end if;

  with team as (
    select user_id
    from public.team_members
    where account_id = v_account
      and coalesce(is_active, true)
    order by user_id
  ),
  cursor as (
    select last_owner_id
    from public.assignment_cursors
    where account_id = v_account
  ),
  next_owner as (
    select t.user_id as user_id
    from team t
    left join cursor c on true
    where c.last_owner_id is null or t.user_id > c.last_owner_id
    order by t.user_id
    limit 1
  )
  select coalesce(
    (select user_id from next_owner),
    (select user_id from team order by user_id limit 1),
    v_account
  )
  into v_owner;

  if v_owner is null then
    return null;
  end if;

  update public.reply_threads
    set owner_id = v_owner
  where id = p_thread
    and owner_id is null;

  insert into public.assignment_cursors(account_id, last_owner_id)
  values (v_account, v_owner)
  on conflict (account_id) do update
    set last_owner_id = excluded.last_owner_id;

  return v_owner;
end $$;

-- Inbound trigger ------------------------------------------------------------
create or replace function public.trg_inbound_thread()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_thread uuid;
begin
  v_thread := public.route_inbound_to_thread(new.id);

  insert into public.activities(
    account_id,
    lead_id,
    thread_id,
    identity_id,
    campaign_id,
    kind,
    created_at,
    payload
  )
  values (
    new.account_id,
    new.lead_id,
    v_thread,
    new.identity_id,
    new.campaign_id,
    'reply_ingested',
    now(),
    jsonb_build_object('inbound_id', new.id, 'thread_id', v_thread)
  )
  on conflict do nothing;

  return new;
end $$;

drop trigger if exists after_inbound_thread on public.inbound_messages;
create trigger after_inbound_thread
after insert on public.inbound_messages
for each row execute function public.trg_inbound_thread();

-- Classification trigger -----------------------------------------------------
create or replace function public.trg_thread_on_classify()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_thread uuid;
  v_account uuid;
  v_owner uuid;
  v_title text;
begin
  select thread_id, account_id
    into v_thread, v_account
  from public.inbound_messages
  where id = new.inbound_id;

  if v_thread is null then
    return new;
  end if;

  update public.reply_threads
    set last_label = new.label,
        updated_at = now()
  where id = v_thread;

  select owner_id
    into v_owner
  from public.reply_threads
  where id = v_thread;

  if v_owner is null then
    v_owner := public.auto_assign_owner(v_thread, new.label);
  end if;

  if new.label in ('positive','question') then
    v_title := case new.label
      when 'positive' then 'Reply: interested lead'
      else 'Answer lead question'
    end;

    insert into public.reply_tasks(
      account_id,
      thread_id,
      title,
      due_at,
      assignee_id
    )
    values (
      v_account,
      v_thread,
      v_title,
      now() + interval '1 hour',
      v_owner
    )
    on conflict do nothing;
  end if;

  return new;
end $$;

drop trigger if exists after_class_to_thread on public.reply_classifications;
create trigger after_class_to_thread
after insert on public.reply_classifications
for each row execute function public.trg_thread_on_classify();

-- RPC helpers ----------------------------------------------------------------
create or replace function public.list_hot_threads_since(p_since timestamptz)
returns table(
  account_id uuid,
  last_label text,
  lead_email text,
  campaign_name text,
  link text,
  kind text
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    t.account_id,
    t.last_label,
    l.email as lead_email,
    c.name as campaign_name,
    '/inbox/thread/' || t.id as link,
    'hot' as kind
  from public.reply_threads t
  join public.leads l on l.id = t.lead_id
  left join public.campaigns c on c.id = t.campaign_id
  where t.updated_at >= coalesce(p_since, to_timestamp(0))
    and t.last_label in ('positive','question');
$$;

create or replace function public.list_new_sla_breaches(p_since timestamptz)
returns table(
  account_id uuid,
  lead_email text,
  link text,
  kind text
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    t.account_id,
    l.email as lead_email,
    '/inbox/thread/' || t.id as link,
    'sla_breach' as kind
  from public.reply_sla_states s
  join public.reply_threads t on t.id = s.thread_id
  join public.leads l on l.id = t.lead_id
  where s.first_due_at <= now()
    and s.first_met_at is null
    and s.updated_at >= coalesce(p_since, to_timestamp(0));
$$;

