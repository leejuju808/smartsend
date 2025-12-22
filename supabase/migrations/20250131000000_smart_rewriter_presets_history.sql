-- Smart Template Rewriter — Presets and History
-- Creates rewrite_presets and rewrite_history tables with RLS

-- 1) Rewrite presets table
create table if not exists public.rewrite_presets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  tone text not null check (tone in ('neutral','friendly','professional','bold','concise','warm','curious')),
  focus text not null check (focus in ('clarity','persuasion','brevity','personalization','conversion')),
  active boolean not null default true
);

create index if not exists idx_rewrite_presets_account on public.rewrite_presets(account_id, active, created_at desc);

-- 2) Rewrite history table
create table if not exists public.rewrite_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  preset_id uuid references public.rewrite_presets(id) on delete set null,
  input_text text not null,
  output_text text not null,
  temperature real not null default 0.7,
  model text not null default 'gpt-4o-mini',
  tokens_in int,
  tokens_out int
);

create index if not exists idx_rewrite_history_account on public.rewrite_history(account_id, created_at desc);
create index if not exists idx_rewrite_history_preset on public.rewrite_history(preset_id, created_at desc);

-- 3) Enable RLS
alter table public.rewrite_presets enable row level security;
alter table public.rewrite_history enable row level security;

-- 4) RLS Policies
create policy "user can manage their rewrite presets"
  on public.rewrite_presets 
  using (account_id = auth.uid()) 
  with check (account_id = auth.uid());

create policy "user can read their rewrite history"
  on public.rewrite_history 
  for select 
  using (account_id = auth.uid());

-- Note: History is insert-only from edge functions (service role), so no insert policy needed for authenticated users

-- 5) Optional preset seeding
-- Seed a default preset for each account
insert into public.rewrite_presets (account_id, name, tone, focus)
select id, 'Balanced Clarity', 'neutral', 'clarity' from public.accounts
on conflict do nothing;

