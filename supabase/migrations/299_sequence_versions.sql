-- Block 299: Sequence Version History System
-- Auto-snapshots on every edit, diff storage, revert functionality

create table if not exists public.sequence_versions (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  editor_id uuid not null references auth.users(id),
  created_at timestamptz default now(),
  -- full JSON snapshot of sequence + steps
  snapshot jsonb not null,
  -- optional: small note type (edit type)
  change_type text default 'edit'
);

create index if not exists idx_sequence_versions_sequence on public.sequence_versions (sequence_id);
create index if not exists idx_sequence_versions_campaign on public.sequence_versions (campaign_id);
create index if not exists idx_sequence_versions_created_at on public.sequence_versions (created_at desc);

-- RLS policies
alter table public.sequence_versions enable row level security;

-- Users can view versions for sequences they have access to
create policy "users can view sequence versions" on public.sequence_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.sequences s
      where s.id = sequence_versions.sequence_id
      and (
        s.workspace_id = auth.uid()
        or exists (
          select 1 from public.campaign_members cm
          where cm.campaign_id = sequence_versions.campaign_id
          and cm.user_id = auth.uid()
        )
      )
    )
  );

-- Service role can insert versions
create policy "service role can insert versions" on public.sequence_versions
  for all to service_role
  using (true) with check (true);








