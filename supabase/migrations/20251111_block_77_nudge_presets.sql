-- Block 77 · Nudge preset library (presets, variants, routing, view, RLS)

-- 1) Enums
do $$ begin
  create type public.nudge_scope as enum ('account', 'campaign');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.nudge_channel as enum ('email', 'reply');
exception when duplicate_object then null;
end $$;

-- 2) Presets container
create table if not exists public.nudge_presets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  scope public.nudge_scope not null default 'account',
  campaign_id uuid references public.campaigns(id) on delete cascade,
  key text not null,
  label text not null default 'General',
  channel public.nudge_channel not null default 'email',
  status text not null default 'active' check (status in ('active', 'archived')),
  unique (account_id, scope, coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
);

drop trigger if exists trg_nudge_presets_updated_at on public.nudge_presets;
create trigger trg_nudge_presets_updated_at
before update on public.nudge_presets
for each row execute function public.set_updated_at();

-- 3) Variants for each preset (A/B/C, etc.)
create table if not exists public.nudge_preset_variants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  preset_id uuid not null references public.nudge_presets(id) on delete cascade,
  name text not null,
  weight numeric not null default 0.5 check (weight >= 0 and weight <= 1),
  subject text,
  body_html text,
  body_text text,
  status text not null default 'active' check (status in ('active', 'paused'))
);

create index if not exists idx_nudge_preset_variants_preset on public.nudge_preset_variants (preset_id);

drop trigger if exists trg_nudge_preset_variants_updated_at on public.nudge_preset_variants;
create trigger trg_nudge_preset_variants_updated_at
before update on public.nudge_preset_variants
for each row execute function public.set_updated_at();

-- 4) Routing map by classifier label (fallback to 'default')
create table if not exists public.nudge_routing (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  label public.reply_label not null,
  preset_key text not null,
  unique (account_id, label)
);

drop trigger if exists trg_nudge_routing_updated_at on public.nudge_routing;
create trigger trg_nudge_routing_updated_at
before update on public.nudge_routing
for each row execute function public.set_updated_at();

-- 5) Helper view: resolve preset for a given lead preference
create or replace view public.v_resolved_preset as
select
  p.account_id,
  p.scope,
  p.campaign_id,
  p.key as preset_key,
  jsonb_agg(
    jsonb_build_object(
      'variant_id', v.id,
      'name', v.name,
      'weight', v.weight,
      'subject', v.subject,
      'body_html', v.body_html,
      'body_text', v.body_text,
      'status', v.status
    )
    order by v.created_at
  ) as variants
from public.nudge_presets p
join public.nudge_preset_variants v
  on v.preset_id = p.id
  and v.status = 'active'
where p.status = 'active'
group by 1, 2, 3, 4;

-- 6) Row level security
alter table public.nudge_presets enable row level security;
drop policy if exists nudge_presets_isolation on public.nudge_presets;
create policy nudge_presets_isolation on public.nudge_presets
for all using (account_id = auth.uid())
with check (account_id = auth.uid());

alter table public.nudge_preset_variants enable row level security;
drop policy if exists nudge_preset_variants_isolation on public.nudge_preset_variants;
create policy nudge_preset_variants_isolation on public.nudge_preset_variants
for all using (
  exists (
    select 1
    from public.nudge_presets p
    where p.id = preset_id
      and p.account_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.nudge_presets p
    where p.id = preset_id
      and p.account_id = auth.uid()
  )
);

alter table public.nudge_routing enable row level security;
drop policy if exists nudge_routing_isolation on public.nudge_routing;
create policy nudge_routing_isolation on public.nudge_routing
for all using (account_id = auth.uid())
with check (account_id = auth.uid());

