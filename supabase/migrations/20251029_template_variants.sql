create table if not exists public.campaign_template_variants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  subject_template text not null,
  body_template text not null,
  weight int not null default 50,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, name)
);

alter table public.campaign_template_variants
  add column if not exists sent_count int not null default 0,
  add column if not exists open_count int not null default 0,
  add column if not exists click_count int not null default 0,
  add column if not exists reply_count int not null default 0;

create index if not exists ctv_campaign_idx on public.campaign_template_variants (campaign_id);

alter table public.campaign_template_variants enable row level security;

drop policy if exists "ctv_r" on public.campaign_template_variants;
create policy "ctv_r" on public.campaign_template_variants
  for select using (
    exists (
      select 1 from public.v_campaign_access a
      where a.campaign_id = campaign_template_variants.campaign_id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists "ctv_cu" on public.campaign_template_variants;
create policy "ctv_cu" on public.campaign_template_variants
  for insert with check (
    exists (
      select 1 from public.v_campaign_access a
      where a.campaign_id = campaign_template_variants.campaign_id
        and a.user_id = auth.uid()
        and a.role in ('owner','editor')
    )
  );

drop policy if exists "ctv_upd" on public.campaign_template_variants;
create policy "ctv_upd" on public.campaign_template_variants
  for update using (
    exists (
      select 1 from public.v_campaign_access a
      where a.campaign_id = campaign_template_variants.campaign_id
        and a.user_id = auth.uid()
        and a.role in ('owner','editor')
    )
  );


