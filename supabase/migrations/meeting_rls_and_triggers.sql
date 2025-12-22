-- Enable row level security on meeting tables
alter table public.meeting_prefs    enable row level security;
alter table public.meeting_intents  enable row level security;
alter table public.meeting_slots    enable row level security;

-- ========== meeting_prefs ==========
drop policy if exists "prefs sel" on public.meeting_prefs;
create policy "prefs sel" on public.meeting_prefs
  for select using (public.is_campaign_viewer(campaign_id));

drop policy if exists "prefs ins" on public.meeting_prefs;
create policy "prefs ins" on public.meeting_prefs
  for insert with check (public.is_campaign_editor(campaign_id));

drop policy if exists "prefs upd" on public.meeting_prefs;
create policy "prefs upd" on public.meeting_prefs
  for update using (public.is_campaign_editor(campaign_id))
  with check (public.is_campaign_editor(campaign_id));

drop policy if exists "prefs del" on public.meeting_prefs;
create policy "prefs del" on public.meeting_prefs
  for delete using (public.is_campaign_owner(campaign_id));

-- ========== meeting_intents ==========
drop policy if exists "intents sel" on public.meeting_intents;
create policy "intents sel" on public.meeting_intents
  for select using (public.is_campaign_viewer(campaign_id));

drop policy if exists "intents ins" on public.meeting_intents;
create policy "intents ins" on public.meeting_intents
  for insert with check (public.is_campaign_editor(campaign_id));

drop policy if exists "intents upd" on public.meeting_intents;
create policy "intents upd" on public.meeting_intents
  for update using (public.is_campaign_editor(campaign_id))
  with check (public.is_campaign_editor(campaign_id));

drop policy if exists "intents del" on public.meeting_intents;
create policy "intents del" on public.meeting_intents
  for delete using (public.is_campaign_owner(campaign_id));

-- ========== meeting_slots ==========
drop policy if exists "slots sel" on public.meeting_slots;
create policy "slots sel" on public.meeting_slots
  for select using (
    public.is_campaign_viewer(
      (select t.campaign_id from public.inbox_threads t where t.id = meeting_slots.thread_id)
    )
  );

drop policy if exists "slots ins" on public.meeting_slots;
create policy "slots ins" on public.meeting_slots
  for insert with check (
    public.is_campaign_editor(
      (select t.campaign_id from public.inbox_threads t where t.id = meeting_slots.thread_id)
    )
  );

drop policy if exists "slots upd" on public.meeting_slots;
create policy "slots upd" on public.meeting_slots
  for update using (
    public.is_campaign_editor(
      (select t.campaign_id from public.inbox_threads t where t.id = meeting_slots.thread_id)
    )
  )
  with check (
    public.is_campaign_editor(
      (select t.campaign_id from public.inbox_threads t where t.id = meeting_slots.thread_id)
    )
  );

drop policy if exists "slots del" on public.meeting_slots;
create policy "slots del" on public.meeting_slots
  for delete using (
    public.is_campaign_owner(
      (select t.campaign_id from public.inbox_threads t where t.id = meeting_slots.thread_id)
    )
  );

-- Ensure http extension for triggers
create extension if not exists http with schema extensions;

-- Store the edge function base URL and service role key
do $$
begin
  perform set_config('app.functions_base', 'https://<PROJECT-REF>.functions.supabase.co', true);
  perform set_config('app.service_role', '<SERVICE-ROLE-KEY>', true);
end$$;

-- Trigger function to notify meeting intent edge function
create or replace function public._notify_meeting_intent()
returns trigger
language plpgsql
as $$
declare
  url text := current_setting('app.functions_base', true) || '/meeting-intent';
  key text := current_setting('app.service_role', true);
  resp jsonb;
begin
  if new.direction = 'inbound'
     and coalesce(new.ai_label, '') in ('interested', 'book_meeting', 'question', 'human_reply') then
    select extensions.http_post(
      url,
      to_jsonb(new)::text,
      array[
        extensions.http_header('content-type', 'application/json'),
        extensions.http_header('authorization', 'Bearer ' || key)
      ]
    )::jsonb
    into resp;
  end if;
  return new;
end;
$$;

-- Wire trigger to normalized_messages table
drop trigger if exists trg_notify_meeting_intent on public.normalized_messages;
create trigger trg_notify_meeting_intent
after insert on public.normalized_messages
for each row execute function public._notify_meeting_intent();

-- Performance indexes
create index if not exists idx_meet_intents_thread on public.meeting_intents(thread_id);
create index if not exists idx_meet_intents_campaign on public.meeting_intents(campaign_id);



