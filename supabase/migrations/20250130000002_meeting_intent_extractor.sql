-- Block 486 — Meeting Intent Extractor v2
-- Add intent fields to lead_replies table

-- Create lead_replies table if it doesn't exist (basic structure)
create table if not exists public.lead_replies (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  subject text,
  body_text text,
  body_html text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add intent fields
alter table public.lead_replies
  add column if not exists intent_label text,
  add column if not exists intent_confidence numeric,
  add column if not exists meeting_readiness text,
  add column if not exists suggested_meeting_times jsonb;

-- Create indexes
create index if not exists idx_lead_replies_lead_id on public.lead_replies(lead_id);
create index if not exists idx_lead_replies_intent_label on public.lead_replies(intent_label);
create index if not exists idx_lead_replies_meeting_readiness on public.lead_replies(meeting_readiness);
create index if not exists idx_lead_replies_created_at on public.lead_replies(created_at desc);

-- Enable RLS
alter table public.lead_replies enable row level security;

-- RLS policies
drop policy if exists "lead_replies_select_own" on public.lead_replies;
create policy "lead_replies_select_own" on public.lead_replies
  for select to authenticated
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_replies.lead_id
      and l.workspace_id in (
        select workspace_id from public.workspace_members
        where user_id = auth.uid()
      )
    )
  );

drop policy if exists "lead_replies_insert_service" on public.lead_replies;
create policy "lead_replies_insert_service" on public.lead_replies
  for insert to service_role
  using (true) with check (true);

drop policy if exists "lead_replies_update_service" on public.lead_replies;
create policy "lead_replies_update_service" on public.lead_replies
  for update to service_role
  using (true) with check (true);

-- Trigger to update updated_at
create or replace function public.update_lead_replies_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_lead_replies_updated_at on public.lead_replies;
create trigger trg_lead_replies_updated_at before update on public.lead_replies
  for each row execute function public.update_lead_replies_updated_at();

