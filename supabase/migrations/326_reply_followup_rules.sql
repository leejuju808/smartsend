-- Block 326 — Reply-Based Follow-Up Rules v1
-- AI reply category → auto stop / opt-out / bounce handling

-- ============================================================================
-- 1. REPLY_FOLLOWUP_RULES TABLE
-- ============================================================================

create table if not exists public.reply_followup_rules (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade, -- null = global rule
  name text not null,

  ai_category text,            -- 'interested', 'not_interested', 'out_of_office', 'bounce', ...
  action text not null,        -- 'stop_sequence', 'opt_out', 'mark_bounced'
  is_enabled boolean not null default true,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint reply_followup_rules_action_check
    check (action in ('stop_sequence', 'opt_out', 'mark_bounced'))
);

-- Indexes
create index if not exists reply_followup_rules_workspace_idx
  on public.reply_followup_rules (workspace_id);

create index if not exists reply_followup_rules_workspace_campaign_idx
  on public.reply_followup_rules (workspace_id, campaign_id);

create index if not exists reply_followup_rules_category_idx
  on public.reply_followup_rules (workspace_id, ai_category);

-- Updated_at trigger
create or replace function set_reply_followup_rules_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_reply_followup_rules_updated_at on public.reply_followup_rules;

create trigger trg_reply_followup_rules_updated_at
before update on public.reply_followup_rules
for each row
execute procedure set_reply_followup_rules_updated_at();

-- ============================================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================================

alter table public.reply_followup_rules enable row level security;

-- Policy: Users can view rules in their workspace
create policy "Users can view reply_followup_rules in their workspace"
  on public.reply_followup_rules
  for select
  using (
    exists (
      select 1 from public.team_members tm
      where tm.workspace_id = reply_followup_rules.workspace_id
        and tm.user_id = auth.uid()
    )
  );

-- Policy: Users can manage rules in their workspace (owners/admins only)
create policy "Owners and admins can manage reply_followup_rules"
  on public.reply_followup_rules
  for all
  using (
    exists (
      select 1 from public.team_members tm
      where tm.workspace_id = reply_followup_rules.workspace_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.team_members tm
      where tm.workspace_id = reply_followup_rules.workspace_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    )
  );

-- ============================================================================
-- 3. SEED DEFAULT RULES
-- ============================================================================

-- Default rule: Stop sequence + opt-out on Not Interested
insert into public.reply_followup_rules (workspace_id, campaign_id, name, ai_category, action)
select
  w.id as workspace_id,
  null as campaign_id,
  'Stop sequence + opt-out on Not Interested' as name,
  'not_interested' as ai_category,
  'opt_out' as action
from public.workspaces w
where not exists (
  select 1 from public.reply_followup_rules r
  where r.workspace_id = w.id
    and r.ai_category = 'not_interested'
    and r.action = 'opt_out'
    and r.campaign_id is null
);

-- Default rule: Stop sequence + mark bounced on Bounce
insert into public.reply_followup_rules (workspace_id, campaign_id, name, ai_category, action)
select
  w.id,
  null,
  'Stop sequence + mark bounced on Bounce',
  'bounce',
  'mark_bounced'
from public.workspaces w
where not exists (
  select 1 from public.reply_followup_rules r
  where r.workspace_id = w.id
    and r.ai_category = 'bounce'
    and r.action = 'mark_bounced'
    and r.campaign_id is null
);







