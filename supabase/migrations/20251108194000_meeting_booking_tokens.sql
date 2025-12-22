-- Meeting booking tokens and preference enhancements

create table if not exists public.meeting_booking_tokens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  slot_id uuid not null references public.meeting_slots(id) on delete cascade,
  lead_email text,
  expires_at timestamptz not null default (now() + interval '14 days'),
  used_at timestamptz,
  used_by text,
  unique(thread_id, slot_id)
);

create index if not exists idx_mbt_thread on public.meeting_booking_tokens(thread_id);
create index if not exists idx_mbt_expires on public.meeting_booking_tokens(expires_at);

alter table public.meeting_booking_tokens enable row level security;

drop policy if exists "mbt sel" on public.meeting_booking_tokens;
create policy "mbt sel" on public.meeting_booking_tokens
for select using (
  public.is_campaign_viewer(
    (select t.campaign_id from public.inbox_threads t where t.id = meeting_booking_tokens.thread_id)
  )
);

drop policy if exists "mbt ins" on public.meeting_booking_tokens;
create policy "mbt ins" on public.meeting_booking_tokens
for insert with check (
  public.is_campaign_editor(
    (select t.campaign_id from public.inbox_threads t where t.id = meeting_booking_tokens.thread_id)
  )
);

drop policy if exists "mbt upd" on public.meeting_booking_tokens;
create policy "mbt upd" on public.meeting_booking_tokens
for update using (
  public.is_campaign_editor(
    (select t.campaign_id from public.inbox_threads t where t.id = meeting_booking_tokens.thread_id)
  )
) with check (
  public.is_campaign_editor(
    (select t.campaign_id from public.inbox_threads t where t.id = meeting_booking_tokens.thread_id)
  )
);

alter table public.meeting_prefs
  add column if not exists auto_book_links boolean not null default true,
  add column if not exists confirmation_template text;


