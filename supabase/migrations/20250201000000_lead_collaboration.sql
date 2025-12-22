-- Lead Collaboration System
-- Activities, notes, pins, mentions, reactions, triggers, RPCs, and views

-- 1) Core tables (idempotent)

-- A) Enum for activity kinds
do $$
begin
  perform 1 from pg_type where typname = 'lead_activity_kind';
  if not found then
    create type public.lead_activity_kind as enum (
      'message_in',
      'message_out',
      'status_change',
      'owner_change',
      'task_open',
      'task_done',
      'automation',
      'system',
      'note'
    );
  end if;
end $$;

-- B) Lead activities (append-only)
create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  kind public.lead_activity_kind not null,
  title text,
  body text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_lead_activities_lead
  on public.lead_activities (lead_id, created_at desc);

-- C) Notes (rich text/markdown stored as text)
create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  is_internal boolean not null default true
);

create index if not exists idx_lead_notes_lead
  on public.lead_notes (lead_id, created_at desc);

-- D) Pins (highlighted insights)
create table if not exists public.lead_pins (
  lead_id uuid not null references public.leads(id) on delete cascade,
  note_id uuid not null references public.lead_notes(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete set null,
  pinned_at timestamptz not null default now(),
  primary key (lead_id, note_id)
);

-- E) Mentions + simple reactions
create table if not exists public.lead_note_mentions (
  note_id uuid not null references public.lead_notes(id) on delete cascade,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, mentioned_user_id)
);

create table if not exists public.lead_note_reactions (
  note_id uuid not null references public.lead_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id, emoji)
);

-- F) Search (optional)
create extension if not exists pg_trgm;

create index if not exists idx_lead_notes_search
  on public.lead_notes using gin (body gin_trgm_ops);

-- G) RLS helpers & policies (scope by campaign access)
alter table public.lead_activities enable row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_pins enable row level security;
alter table public.lead_note_mentions enable row level security;
alter table public.lead_note_reactions enable row level security;

create or replace function public.uid()
returns uuid
language sql
stable
as $$
  select auth.uid()
$$;

drop policy if exists lead_activities_select on public.lead_activities;
create policy lead_activities_select on public.lead_activities
for select using (
  exists (
    select 1
    from public.v_campaign_access a
    where a.user_id = public.uid()
      and a.campaign_id = lead_activities.campaign_id
  )
);

drop policy if exists lead_notes_select on public.lead_notes;
create policy lead_notes_select on public.lead_notes
for select using (
  exists (
    select 1
    from public.v_campaign_access a
    where a.user_id = public.uid()
      and a.campaign_id = lead_notes.campaign_id
  )
);

drop policy if exists lead_notes_insert on public.lead_notes;
create policy lead_notes_insert on public.lead_notes
for insert with check (
  exists (
    select 1
    from public.v_campaign_access a
    where a.user_id = public.uid()
      and a.campaign_id = lead_notes.campaign_id
  )
);

drop policy if exists lead_notes_update on public.lead_notes;
create policy lead_notes_update on public.lead_notes
for update using (author_user_id = public.uid())
  with check (author_user_id = public.uid());

drop policy if exists lead_pins_select on public.lead_pins;
create policy lead_pins_select on public.lead_pins
for select using (
  exists (
    select 1
    from public.v_campaign_access a
    where a.user_id = public.uid()
      and a.campaign_id = (
        select campaign_id from public.lead_notes n where n.id = lead_pins.note_id
      )
  )
);

drop policy if exists lead_pins_all on public.lead_pins;
create policy lead_pins_all on public.lead_pins
for all using (
  exists (
    select 1
    from public.v_campaign_access a
    where a.user_id = public.uid()
      and a.campaign_id = (
        select campaign_id from public.lead_notes n where n.id = lead_pins.note_id
      )
  )
)
with check (true);

drop policy if exists lead_note_mentions_select on public.lead_note_mentions;
create policy lead_note_mentions_select on public.lead_note_mentions
for select using (
  exists (
    select 1
    from public.v_campaign_access a
    join public.lead_notes n on n.id = lead_note_mentions.note_id
    where a.user_id = public.uid()
      and a.campaign_id = n.campaign_id
  )
);

drop policy if exists lead_note_mentions_insert on public.lead_note_mentions;
create policy lead_note_mentions_insert on public.lead_note_mentions
for insert with check (
  exists (
    select 1
    from public.v_campaign_access a
    join public.lead_notes n on n.id = lead_note_mentions.note_id
    where a.user_id = public.uid()
      and a.campaign_id = n.campaign_id
  )
);

drop policy if exists lead_note_reactions_select on public.lead_note_reactions;
create policy lead_note_reactions_select on public.lead_note_reactions
for select using (
  exists (
    select 1
    from public.v_campaign_access a
    join public.lead_notes n on n.id = lead_note_reactions.note_id
    where a.user_id = public.uid()
      and a.campaign_id = n.campaign_id
  )
);

drop policy if exists lead_note_reactions_all on public.lead_note_reactions;
create policy lead_note_reactions_all on public.lead_note_reactions
for all using (
  exists (
    select 1
    from public.v_campaign_access a
    join public.lead_notes n on n.id = lead_note_reactions.note_id
    where a.user_id = public.uid()
      and a.campaign_id = n.campaign_id
  )
)
with check (true);

-- H) Update timestamp trigger for notes
create or replace function public.touch_note_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists trg_touch_note on public.lead_notes;
create trigger trg_touch_note
before update on public.lead_notes
for each row
execute function public.touch_note_updated_at();

-- 2) Auto-logging triggers (messages, status/owner changes, tasks)

-- A) On message insert → activity
create or replace function public.trg_act_messages()
returns trigger
language plpgsql
as $$
declare
  v_campaign uuid;
begin
  select t.campaign_id into v_campaign
  from public.threads t
  where t.id = new.thread_id;

  insert into public.lead_activities (
    lead_id,
    campaign_id,
    actor_user_id,
    kind,
    title,
    body,
    meta
  )
  values (
    new.lead_id,
    v_campaign,
    case when new.direction = 'outbound' then new.sender_user_id else null end,
    case when new.direction = 'outbound' then 'message_out' else 'message_in' end,
    coalesce(new.subject, ''),
    left(coalesce(new.body_text, ''), 500),
    jsonb_build_object('message_id', new.id)
  );

  return new;
end
$$;

drop trigger if exists t_act_messages on public.messages;
create trigger t_act_messages
after insert on public.messages
for each row
execute function public.trg_act_messages();

-- B) Lead status changes
alter table public.leads add column if not exists status text;

create or replace function public.trg_act_lead_status()
returns trigger
language plpgsql
as $$
declare
  v_campaign uuid;
begin
  if new.status is distinct from old.status then
    v_campaign := new.campaign_id;
    insert into public.lead_activities (
      lead_id,
      campaign_id,
      actor_user_id,
      kind,
      title,
      body,
      meta
    )
    values (
      new.id,
      v_campaign,
      public.uid(),
      'status_change',
      'Status changed',
      coalesce(old.status, '') || ' → ' || coalesce(new.status, ''),
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end
$$;

drop trigger if exists t_act_lead_status on public.leads;
create trigger t_act_lead_status
after update on public.leads
for each row
execute function public.trg_act_lead_status();

-- C) Thread owner changes
create or replace function public.trg_act_owner_change()
returns trigger
language plpgsql
as $$
declare
  v_campaign uuid;
begin
  if new.owner_id is distinct from old.owner_id then
    select campaign_id into v_campaign from public.threads where id = new.id;
    insert into public.lead_activities (
      lead_id,
      campaign_id,
      actor_user_id,
      kind,
      title,
      body,
      meta
    )
    values (
      new.lead_id,
      v_campaign,
      public.uid(),
      'owner_change',
      'Owner reassigned',
      coalesce(old.owner_id::text, '—') || ' → ' || coalesce(new.owner_id::text, '—'),
      jsonb_build_object('from', old.owner_id, 'to', new.owner_id, 'thread_id', new.id)
    );
  end if;
  return new;
end
$$;

drop trigger if exists t_act_owner_change on public.threads;
create trigger t_act_owner_change
after update on public.threads
for each row
execute function public.trg_act_owner_change();

-- D) Task open/done
create or replace function public.trg_act_tasks()
returns trigger
language plpgsql
as $$
declare
  v_campaign uuid;
begin
  select campaign_id into v_campaign
  from public.threads
  where id = coalesce(new.thread_id, old.thread_id);

  if tg_op = 'INSERT' then
    insert into public.lead_activities (
      lead_id,
      campaign_id,
      actor_user_id,
      kind,
      title,
      body,
      meta
    )
    values (
      new.lead_id,
      v_campaign,
      public.uid(),
      'task_open',
      new.title,
      coalesce(new.priority, 'normal'),
      jsonb_build_object('task_id', new.id)
    );
    return new;
  elsif tg_op = 'UPDATE' and new.status = 'done' and old.status is distinct from 'done' then
    insert into public.lead_activities (
      lead_id,
      campaign_id,
      actor_user_id,
      kind,
      title,
      body,
      meta
    )
    values (
      new.lead_id,
      v_campaign,
      public.uid(),
      'task_done',
      new.title,
      'completed',
      jsonb_build_object('task_id', new.id)
    );
    return new;
  end if;
  return new;
end
$$;

drop trigger if exists t_act_tasks on public.tasks;
create trigger t_act_tasks
after insert or update on public.tasks
for each row
execute function public.trg_act_tasks();

-- 3) RPC helpers

-- Create a note and mirror to activities
create or replace function public.add_lead_note(
  p_lead uuid,
  p_campaign uuid,
  p_body text,
  p_is_internal boolean default true
) returns uuid
language plpgsql
as $$
declare
  nid uuid;
begin
  insert into public.lead_notes (
    lead_id,
    campaign_id,
    author_user_id,
    body,
    is_internal
  )
  values (
    p_lead,
    p_campaign,
    public.uid(),
    p_body,
    p_is_internal
  )
  returning id into nid;

  insert into public.lead_activities (
    lead_id,
    campaign_id,
    actor_user_id,
    kind,
    title,
    body,
    meta
  )
  values (
    p_lead,
    p_campaign,
    public.uid(),
    'note',
    'Note added',
    left(p_body, 140),
    jsonb_build_object('note_id', nid)
  );

  return nid;
end
$$;

-- Latest pin summary (for lead header)
create or replace view public.v_lead_latest_pin as
select lead_id, note_id, body, pinned_at
from (
  select
    lp.lead_id,
    lp.note_id,
    n.body,
    lp.pinned_at,
    row_number() over (
      partition by lp.lead_id
      order by lp.pinned_at desc
    ) as rn
  from public.lead_pins lp
  join public.lead_notes n on n.id = lp.note_id
) ranked
where rn = 1;

-- 4) Placeholder for mentions & reactions RPCs (optional future work)
-- Additional RPCs can be added as needed.

