-- Prompt Packs Versioning System
-- Implements versioned prompt packs for rewrite, policy, and guardrails with campaign overrides

-- Step 1: Create prompt_packs table
create table if not exists public.prompt_packs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null,                           -- tenant (references auth.users or accounts)
  name text not null,                                 -- e.g., "ToneLearner v1"
  kind text not null check (kind in ('rewrite','policy','guardrails')), -- pack family
  status text not null default 'active' check (status in ('active','archived')),
  unique (account_id, name, kind)
);

create index if not exists idx_prompt_packs_account_kind on public.prompt_packs(account_id, kind, status);
create index if not exists idx_prompt_packs_account_status on public.prompt_packs(account_id, status);

-- Step 2: Create prompt_pack_versions table
create table if not exists public.prompt_pack_versions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pack_id uuid not null references public.prompt_packs(id) on delete cascade,
  version int not null,                               -- 1,2,3…
  -- content blobs
  system_prompt text not null,                        -- full system text
  user_template text,                                 -- optional user template
  config jsonb,                                       -- weights: {epsilon,minSamples,objectiveWeights…}
  notes text,
  unique (pack_id, version)
);

create index if not exists idx_prompt_pack_versions_pack on public.prompt_pack_versions(pack_id, version desc);

-- Step 3: Create campaign_prompt_overrides table
create table if not exists public.campaign_prompt_overrides (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_number int,                                    -- null = all steps
  kind text not null check (kind in ('rewrite','policy','guardrails')),
  pack_id uuid not null references public.prompt_packs(id) on delete cascade,
  version int not null,
  unique (campaign_id, step_number, kind)
);

create index if not exists idx_campaign_prompt_overrides_campaign on public.campaign_prompt_overrides(campaign_id, kind);
create index if not exists idx_campaign_prompt_overrides_step on public.campaign_prompt_overrides(campaign_id, step_number, kind);

-- Step 4: Add columns to scheduled_messages for audit & reproducibility
alter table public.scheduled_messages
  add column if not exists rewrite_prompt_version int,
  add column if not exists rewrite_pack_id uuid references public.prompt_packs(id) on delete set null,
  add column if not exists policy_prompt_version int,
  add column if not exists policy_pack_id uuid references public.prompt_packs(id) on delete set null,
  add column if not exists guardrails_prompt_version int,
  add column if not exists guardrails_pack_id uuid references public.prompt_packs(id) on delete set null;

create index if not exists idx_scheduled_messages_rewrite_pack on public.scheduled_messages(rewrite_pack_id, rewrite_prompt_version);
create index if not exists idx_scheduled_messages_policy_pack on public.scheduled_messages(policy_pack_id, policy_prompt_version);
create index if not exists idx_scheduled_messages_guardrails_pack on public.scheduled_messages(guardrails_pack_id, guardrails_prompt_version);

-- Step 5: Create RPC function to get latest active pack for campaign
create or replace function public.get_latest_active_pack_for_campaign(
  p_campaign_id uuid,
  p_kind text
)
returns table (
  pack_id uuid,
  version int,
  system_prompt text,
  user_template text,
  config jsonb
)
language plpgsql
stable
as $$
declare
  v_account_id uuid;
begin
  -- Get account_id from campaign (try account_id first, then workspace_id, then user_id)
  select coalesce(c.account_id, c.workspace_id, c.user_id)
  into v_account_id
  from public.campaigns c
  where c.id = p_campaign_id;

  if v_account_id is null then
    return;
  end if;

  -- Return latest active pack version for this account and kind
  return query
  select
    pp.id as pack_id,
    ppv.version,
    ppv.system_prompt,
    ppv.user_template,
    ppv.config
  from public.prompt_packs pp
  inner join public.prompt_pack_versions ppv on ppv.pack_id = pp.id
  where pp.account_id = v_account_id
    and pp.kind = p_kind
    and pp.status = 'active'
  order by pp.created_at desc, ppv.version desc
  limit 1;
end;
$$;

-- Step 6: Add updated_at trigger for prompt_packs
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_prompt_packs_updated_at on public.prompt_packs;
create trigger trg_prompt_packs_updated_at
before update on public.prompt_packs
for each row execute function public.set_updated_at();

-- Step 7: RLS policies
alter table public.prompt_packs enable row level security;
alter table public.prompt_pack_versions enable row level security;
alter table public.campaign_prompt_overrides enable row level security;

-- Service role has full access
create policy "service_role_full_prompt_packs" on public.prompt_packs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service_role_full_prompt_pack_versions" on public.prompt_pack_versions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service_role_full_campaign_prompt_overrides" on public.campaign_prompt_overrides
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Users can read/write packs for their account
create policy "users_select_prompt_packs" on public.prompt_packs
  for select
  using (
    account_id = auth.uid() or
    exists (
      select 1 from public.campaigns c
      where c.id in (select campaign_id from public.campaign_prompt_overrides where pack_id = prompt_packs.id)
      and (c.account_id = auth.uid() or c.workspace_id = auth.uid() or c.user_id = auth.uid())
    )
  );

create policy "users_insert_prompt_packs" on public.prompt_packs
  for insert
  with check (account_id = auth.uid());

create policy "users_update_prompt_packs" on public.prompt_packs
  for update
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

create policy "users_select_prompt_pack_versions" on public.prompt_pack_versions
  for select
  using (
    exists (
      select 1 from public.prompt_packs pp
      where pp.id = prompt_pack_versions.pack_id
      and (
        pp.account_id = auth.uid() or
        exists (
          select 1 from public.campaigns c
          where c.id in (select campaign_id from public.campaign_prompt_overrides where pack_id = pp.id)
          and (c.account_id = auth.uid() or c.workspace_id = auth.uid() or c.user_id = auth.uid())
        )
      )
    )
  );

create policy "users_insert_prompt_pack_versions" on public.prompt_pack_versions
  for insert
  with check (
    exists (
      select 1 from public.prompt_packs pp
      where pp.id = prompt_pack_versions.pack_id
      and pp.account_id = auth.uid()
    )
  );

create policy "users_select_campaign_prompt_overrides" on public.campaign_prompt_overrides
  for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_prompt_overrides.campaign_id
      and (c.account_id = auth.uid() or c.workspace_id = auth.uid() or c.user_id = auth.uid())
    )
  );

create policy "users_insert_campaign_prompt_overrides" on public.campaign_prompt_overrides
  for insert
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_prompt_overrides.campaign_id
      and (c.account_id = auth.uid() or c.workspace_id = auth.uid() or c.user_id = auth.uid())
    )
  );

create policy "users_update_campaign_prompt_overrides" on public.campaign_prompt_overrides
  for update
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_prompt_overrides.campaign_id
      and (c.account_id = auth.uid() or c.workspace_id = auth.uid() or c.user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_prompt_overrides.campaign_id
      and (c.account_id = auth.uid() or c.workspace_id = auth.uid() or c.user_id = auth.uid())
    )
  );

create policy "users_delete_campaign_prompt_overrides" on public.campaign_prompt_overrides
  for delete
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_prompt_overrides.campaign_id
      and (c.account_id = auth.uid() or c.workspace_id = auth.uid() or c.user_id = auth.uid())
    )
  );















