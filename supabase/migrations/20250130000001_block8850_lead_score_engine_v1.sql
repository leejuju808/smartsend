-- =========================================================
-- Block 8850 — Lead Score Engine v1
-- Smart Ranking of Every Homeowner: Hot → Warm → Cold
-- =========================================================

-- 1) Add score column to leads table
alter table public.leads
  add column if not exists score integer not null default 0;

-- Add index for fast sorting by score
create index if not exists idx_leads_score_desc 
  on public.leads(score desc, created_at desc);

-- 2) Create lead_score_events table to log all score changes
create table if not exists public.lead_score_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  delta integer not null,
  new_score integer not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for fast lookups
create index if not exists lead_score_events_lead_idx
  on public.lead_score_events(lead_id);

create index if not exists lead_score_events_owner_idx
  on public.lead_score_events(owner_id);

create index if not exists lead_score_events_type_idx
  on public.lead_score_events(event_type);

-- RLS for lead_score_events
alter table public.lead_score_events enable row level security;

-- Policy: Users can view score events for leads in their workspace
create policy "Users can view score events for their workspace leads"
  on public.lead_score_events
  for select
  using (
    lead_id in (
      select id from public.leads
      where workspace_id in (
        select workspace_id from public.workspace_members
        where user_id = auth.uid()
      )
    )
  );

-- Policy: Service role can insert score events
create policy "Service role can insert score events"
  on public.lead_score_events
  for insert
  with check (true);

-- 3) Ensure classification column exists (for auto-hot conversion)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'leads' 
    and column_name = 'classification'
  ) then
    alter table public.leads 
      add column classification text check (classification in ('hot', 'warm', 'cold', 'not_interested'));
  end if;
end $$;

-- 4) Function to get owner_id from lead's workspace
create or replace function public.get_lead_owner_id(p_lead_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_owner_id uuid;
begin
  -- Get workspace owner (first member or workspace owner)
  select wm.user_id into v_owner_id
  from public.leads l
  join public.workspace_members wm on wm.workspace_id = l.workspace_id
  where l.id = p_lead_id
  order by wm.created_at asc
  limit 1;
  
  -- Fallback: if no members, try workspace owner
  if v_owner_id is null then
    select owner_id into v_owner_id
    from public.leads l
    join public.workspaces w on w.id = l.workspace_id
    where l.id = p_lead_id;
  end if;
  
  return v_owner_id;
end;
$$;

grant execute on function public.get_lead_owner_id(uuid) to service_role;

























































