-- Lead Threads Inbox with RLS and RPC
-- Enables thread status management (open/replied/archived/snoozed) with permission-aware access

-- 1. Ensure lead_threads table exists with required columns
create table if not exists public.lead_threads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  subject text,
  from_email text,
  last_message_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','replied','archived','snoozed')),
  snooze_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add columns if table exists but missing fields
alter table public.lead_threads
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists subject text,
  add column if not exists from_email text,
  add column if not exists last_message_at timestamptz default now(),
  add column if not exists status text default 'open',
  add column if not exists snooze_until timestamptz,
  add column if not exists updated_at timestamptz default now();

-- Ensure status constraint
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lead_threads_status_check'
  ) then
    alter table public.lead_threads
      drop constraint if exists lead_threads_status_check,
      add constraint lead_threads_status_check
      check (status in ('open','replied','archived','snoozed'));
  end if;
end$$;

-- Indexes for performance
create index if not exists idx_lead_threads_campaign on public.lead_threads(campaign_id);
create index if not exists idx_lead_threads_status on public.lead_threads(campaign_id, status);
create index if not exists idx_lead_threads_last_message on public.lead_threads(campaign_id, last_message_at desc);
create index if not exists idx_lead_threads_lead on public.lead_threads(lead_id);

-- 2. Enable RLS
alter table public.lead_threads enable row level security;

-- 3. Allow collaborators to read threads for a campaign
drop policy if exists lead_threads_read on public.lead_threads;
create policy lead_threads_read on public.lead_threads
  for select using (can_view_campaign(campaign_id));

-- 4. Block direct writes; we'll go through RPC
revoke all on table public.lead_threads from anon, authenticated;

-- Re-grant select for RLS policies
grant select on table public.lead_threads to authenticated;

-- 5. RPC to update thread status (gated by can_edit_campaign)
create or replace function public.update_thread_status(
  p_thread uuid,
  p_status text,
  p_snooze_until timestamptz default null
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_campaign uuid;
begin
  select campaign_id into v_campaign from public.lead_threads where id = p_thread;
  if v_campaign is null then
    raise exception 'thread not found';
  end if;

  if not can_edit_campaign(v_campaign) then
    raise exception 'not authorized';
  end if;

  update public.lead_threads
     set status = p_status,
         snooze_until = case when p_status = 'snoozed' then p_snooze_until else null end,
         updated_at = now()
   where id = p_thread;
end;
$$;

revoke all on function public.update_thread_status(uuid, text, timestamptz) from public;
grant execute on function public.update_thread_status(uuid, text, timestamptz) to authenticated;

-- 6. Helper to fetch the current user's role for a campaign (for UI gating)
create or replace function public.get_user_campaign_role(p_campaign uuid)
returns text language sql stable as $$
  select user_campaign_role(p_campaign);
$$;

revoke all on function public.get_user_campaign_role(uuid) from public;
grant execute on function public.get_user_campaign_role(uuid) to authenticated;

