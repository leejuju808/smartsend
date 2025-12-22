-- Block 177: Intent Signals Table
-- Tracks buying intent signals at company level

create table if not exists public.intent_signals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  account_id uuid not null, -- org_id or workspace_id depending on your setup
  company_id uuid references public.companies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,

  signal_type text not null check (
    signal_type in (
      'reply',
      'multi_open',
      'multi_click',
      'tech_stack_match',
      'inbound_reply',
      'burst_activity',
      'new_lead_same_company',
      'campaign_overlap'
    )
  ),

  weight int not null default 1
);

create index idx_intent_company on intent_signals(company_id);
create index idx_intent_account on intent_signals(account_id);
create index idx_intent_lead on intent_signals(lead_id);
create index idx_intent_type on intent_signals(signal_type);
create index idx_intent_created on intent_signals(created_at desc);

-- RLS
alter table public.intent_signals enable row level security;

-- Policy: Users can read intent signals for companies in their org
create policy "intent_signals_read" on public.intent_signals
  for select using (
    exists (
      select 1 from public.companies c
      where c.id = intent_signals.company_id
      and exists (
        select 1 from public.org_memberships om
        where om.org_id = c.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
      )
    )
  );

-- Policy: Service role can insert/update/delete (for automated signals)
create policy "intent_signals_service_role" on public.intent_signals
  for all to service_role
  using (true) with check (true);

-- Comment
comment on table public.intent_signals is 'Company-level buying intent signals for B2B intelligence';
comment on column public.intent_signals.signal_type is 'Type of intent signal detected';
comment on column public.intent_signals.weight is 'Weight/score for this signal (higher = stronger intent)';












