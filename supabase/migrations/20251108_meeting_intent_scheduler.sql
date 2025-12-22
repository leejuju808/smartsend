-- Meeting scheduling tables and helpers

-- Per-campaign meeting defaults
create table if not exists public.meeting_prefs (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  duration_min int not null default 30,
  tz text,
  workdays int[] not null default '{1,2,3,4,5}',
  start_hour int not null default 9,
  end_hour int not null default 17,
  buffer_min int not null default 15,
  location text,
  booking_link text
);

-- Ensure meeting_prefs has all expected columns (idempotent)
alter table public.meeting_prefs
  alter column duration_min set default 30,
  alter column workdays set default '{1,2,3,4,5}',
  alter column start_hour set default 9,
  alter column end_hour set default 17,
  alter column buffer_min set default 15;

-- Detected meeting intent per thread (latest wins)
create table if not exists public.meeting_intents (
  thread_id uuid primary key references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  detected_at timestamptz not null default now(),
  source_message_id uuid not null references public.inbox_messages(id) on delete cascade,
  lead_tz text,
  my_tz text,
  duration_min int,
  window_start timestamptz,
  window_end timestamptz,
  note text
);

-- Backfill newer columns if earlier schema exists
alter table public.meeting_intents
  add column if not exists duration_min int,
  add column if not exists window_start timestamptz,
  add column if not exists window_end timestamptz;

-- Computed/proposed slots for a thread intent
create table if not exists public.meeting_slots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  start_utc timestamptz not null,
  end_utc timestamptz not null,
  score real not null default 0,
  unique(thread_id, start_utc, end_utc)
);

create index if not exists idx_meeting_slots_thread on public.meeting_slots(thread_id);

-- Thread flags for meeting states
alter table public.inbox_threads
  add column if not exists has_meeting_intent boolean not null default false,
  add column if not exists proposed_meeting boolean not null default false,
  add column if not exists booked_meeting_at timestamptz;

-- RLS
alter table public.meeting_prefs enable row level security;
alter table public.meeting_slots enable row level security;

drop policy if exists meeting_prefs_select on public.meeting_prefs;
create policy meeting_prefs_select on public.meeting_prefs
  for select using (
    exists (
      select 1
      from public.campaign_members cm
      where cm.campaign_id = meeting_prefs.campaign_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists meeting_prefs_modify on public.meeting_prefs;
create policy meeting_prefs_modify on public.meeting_prefs
  for all using (
    exists (
      select 1
      from public.campaign_members cm
      where cm.campaign_id = meeting_prefs.campaign_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1
      from public.campaign_members cm
      where cm.campaign_id = meeting_prefs.campaign_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'editor')
    )
  );

drop policy if exists meeting_slots_select on public.meeting_slots;
create policy meeting_slots_select on public.meeting_slots
  for select using (
    exists (
      select 1
      from public.inbox_threads it
      join public.campaign_members cm on cm.campaign_id = it.campaign_id
      where it.id = meeting_slots.thread_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists meeting_slots_modify on public.meeting_slots;
create policy meeting_slots_modify on public.meeting_slots
  for all using (
    exists (
      select 1
      from public.inbox_threads it
      join public.campaign_members cm on cm.campaign_id = it.campaign_id
      where it.id = meeting_slots.thread_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1
      from public.inbox_threads it
      join public.campaign_members cm on cm.campaign_id = it.campaign_id
      where it.id = meeting_slots.thread_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'editor')
    )
  );



