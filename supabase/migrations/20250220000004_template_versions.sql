-- Template versions tied to a campaign and variant_key

create table if not exists public.template_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  variant_key text not null,                     -- e.g. 'default', 'A', 'B'
  version_label text not null,                   -- e.g. 'v1', '2025-11-02 tweak'
  subject text not null,
  body_md text not null,                         -- store Markdown; render to HTML at send
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  is_active boolean not null default false,
  unique (campaign_id, variant_key, version_label)
);

-- Pointer per (campaign, variant) to the active version (canonical)
create table if not exists public.variant_active_version (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  variant_key text not null,
  template_version_id uuid not null references public.template_versions(id) on delete cascade,
  primary key (campaign_id, variant_key)
);

-- Ensure logs track the version actually used
alter table public.send_logs
  add column if not exists template_version_id uuid references public.template_versions(id);

alter table public.send_logs
  add column if not exists variant_key text;

-- Indexes for performance
create index if not exists idx_tmpl_versions_campaign_variant on public.template_versions(campaign_id, variant_key, created_at desc);
create index if not exists idx_variant_active_version on public.variant_active_version(campaign_id, variant_key);
create index if not exists idx_send_logs_tmpl_version on public.send_logs(campaign_id, variant_key, template_version_id, sent_at desc);

-- RLS for template_versions
alter table public.template_versions enable row level security;

-- Users can read versions for campaigns they have access to
create policy "template_versions_read" on public.template_versions
  for select using (
    exists (
      select 1 from public.v_campaign_access v
      where v.campaign_id = template_versions.campaign_id
        and v.user_id = auth.uid()
    )
  );

-- Users with canSend permission can create/update versions
create policy "template_versions_write" on public.template_versions
  for all using (
    exists (
      select 1 from public.v_campaign_access v
      where v.campaign_id = template_versions.campaign_id
        and v.user_id = auth.uid()
        and v.role in ('admin', 'sender', 'owner', 'editor')
    )
  ) with check (
    exists (
      select 1 from public.v_campaign_access v
      where v.campaign_id = template_versions.campaign_id
        and v.user_id = auth.uid()
        and v.role in ('admin', 'sender', 'owner', 'editor')
    )
  );

-- RLS for variant_active_version
alter table public.variant_active_version enable row level security;

create policy "variant_active_version_read" on public.variant_active_version
  for select using (
    exists (
      select 1 from public.v_campaign_access v
      where v.campaign_id = variant_active_version.campaign_id
        and v.user_id = auth.uid()
    )
  );

create policy "variant_active_version_write" on public.variant_active_version
  for all using (
    exists (
      select 1 from public.v_campaign_access v
      where v.campaign_id = variant_active_version.campaign_id
        and v.user_id = auth.uid()
        and v.role in ('admin', 'sender', 'owner', 'editor')
    )
  ) with check (
    exists (
      select 1 from public.v_campaign_access v
      where v.campaign_id = variant_active_version.campaign_id
        and v.user_id = auth.uid()
        and v.role in ('admin', 'sender', 'owner', 'editor')
    )
  );

