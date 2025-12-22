-- Add flags to replies_inbox (per-message controls)

alter table public.replies_inbox
  add column if not exists is_starred boolean default false,
  add column if not exists is_archived boolean default false;

-- Per lead per campaign notes (one row per pair; append text)

create table if not exists public.reply_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.reply_notes enable row level security;

drop policy if exists sel_reply_notes on public.reply_notes;
create policy sel_reply_notes on public.reply_notes
  for select using (user_id = auth.uid());

drop policy if exists ins_reply_notes on public.reply_notes;
create policy ins_reply_notes on public.reply_notes
  for insert with check (user_id = auth.uid());

-- Helpful indexes

create index if not exists idx_replies_inbox_user_archived on public.replies_inbox(user_id, is_archived, received_at desc);
create index if not exists idx_reply_notes_pair on public.reply_notes(user_id, campaign_id, lead_id, created_at desc);

-- Add update policies for replies_inbox to allow star/archive changes

drop policy if exists upd_replies_inbox on public.replies_inbox;
create policy upd_replies_inbox on public.replies_inbox
  for update using (user_id = auth.uid());

-- Enable realtime for replies_inbox if not already enabled
-- Note: This will fail gracefully if already in publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
    and schemaname = 'public' 
    and tablename = 'replies_inbox'
  ) then
    alter publication supabase_realtime add table public.replies_inbox;
  end if;
end $$;

