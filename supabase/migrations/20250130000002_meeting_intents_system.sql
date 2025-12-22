-- Meeting Intents and Bookings System
-- Step 1: Ensure replies table has necessary fields
alter table public.replies
  add column if not exists contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists reply_text text; -- alias for body_text/body

-- Update reply_text from body_text or body if it exists
update public.replies
set reply_text = coalesce(body_text, body)
where reply_text is null and (body_text is not null or body is not null);

-- Step 2: Create meeting_intents table (proposed meetings extracted from replies)

create table if not exists public.meeting_intents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  reply_id uuid not null references public.replies(id) on delete cascade,
  source text not null default 'reply', -- future: webform, manual, etc.
  intent_confidence numeric not null,   -- 0..1
  text_excerpt text,                    -- the bit we parsed (for audit)
  start_ts timestamptz,                 -- parsed start (UTC)
  end_ts timestamptz,                   -- optional, else duration used
  duration_min int default 30,          -- default 30 min
  timezone text,                        -- e.g., "America/Los_Angeles" if detected
  status text not null default 'proposed' check (status in ('proposed','accepted','booked','rejected','expired')),
  notes text
);

create index if not exists ix_meeting_intents_contact on public.meeting_intents(contact_id, status);
create index if not exists ix_meeting_intents_campaign on public.meeting_intents(campaign_id, status);
create index if not exists ix_meeting_intents_reply on public.meeting_intents(reply_id);
create index if not exists ix_meeting_intents_status on public.meeting_intents(status, created_at desc);

-- Step 2: Create meetings table (concrete bookings after confirm)

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  booked_by uuid references auth.users(id) on delete set null,
  title text not null default 'Intro call',
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  timezone text,
  location text,         -- "Zoom", "Google Meet", phone, etc.
  video_link text,       -- actual link when created
  source text not null default 'inbox', -- inbox/book-page/manual
  reply_id uuid references public.replies(id) on delete set null,
  notes text
);

create index if not exists ix_meetings_contact on public.meetings(contact_id, start_ts);
create index if not exists ix_meetings_campaign on public.meetings(campaign_id, start_ts);
create index if not exists ix_meetings_start_ts on public.meetings(start_ts);

-- RLS policies
alter table public.meeting_intents enable row level security;
alter table public.meetings enable row level security;

-- Meeting intents: users can see intents for campaigns they own
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'meeting_intents' 
    and policyname = 'meeting_intents_select_own'
  ) then
    create policy meeting_intents_select_own on public.meeting_intents
      for select using (
        exists (
          select 1 from public.campaigns c
          where c.id = meeting_intents.campaign_id
            and (c.user_id = auth.uid() or exists (
              select 1 from public.campaign_contacts cc
              where cc.campaign_id = c.id
                and cc.contact_id = meeting_intents.contact_id
            ))
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'meeting_intents' 
    and policyname = 'meeting_intents_service_rw'
  ) then
    create policy meeting_intents_service_rw on public.meeting_intents
      for all using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

-- Meetings: users can see meetings for campaigns they own
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'meetings' 
    and policyname = 'meetings_select_own'
  ) then
    create policy meetings_select_own on public.meetings
      for select using (
        exists (
          select 1 from public.campaigns c
          where c.id = meetings.campaign_id
            and (c.user_id = auth.uid() or exists (
              select 1 from public.campaign_contacts cc
              where cc.campaign_id = c.id
                and cc.contact_id = meetings.contact_id
            ))
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'meetings' 
    and policyname = 'meetings_insert_own'
  ) then
    create policy meetings_insert_own on public.meetings
      for insert with check (
        exists (
          select 1 from public.campaigns c
          where c.id = meetings.campaign_id
            and c.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'meetings' 
    and policyname = 'meetings_service_rw'
  ) then
    create policy meetings_service_rw on public.meetings
      for all using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

-- Ensure message_outcomes has meeting_intent column (if not already added)
alter table public.message_outcomes
  add column if not exists meeting_intent bool default false;

create index if not exists ix_message_outcomes_meeting_intent 
  on public.message_outcomes(meeting_intent) where meeting_intent = true;

-- Helper function to trigger meeting intent extraction (can be called from triggers or manually)
-- Note: This calls the edge function, which should be set up separately
create or replace function public.trigger_meeting_intent_extraction(p_reply_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Call the edge function via HTTP (requires pg_net extension or similar)
  -- For now, this is a placeholder - actual implementation depends on your setup
  -- You can call this manually via API: POST /api/replies/{reply_id}/extract-meeting-intent
  perform net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/meeting-intent-extract',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := jsonb_build_object('reply_id', p_reply_id)
  );
exception
  when others then
    -- Silently fail if pg_net not available or function call fails
    -- Manual extraction can be triggered via API
    null;
end;
$$;

-- Optional: Trigger to auto-extract on reply insert (uncomment if pg_net is available)
-- create trigger trg_extract_meeting_intent_on_reply
--   after insert on public.replies
--   for each row
--   when (new.reply_text is not null or new.body_text is not null or new.body is not null)
--   execute function public.trigger_meeting_intent_extraction(new.id);

