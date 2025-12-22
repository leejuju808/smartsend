-- Block 94 — Smart Template Rewriter (tone/style + ISP-safe)
-- Schema for reusable rewrite presets and rewrite execution history with RLS.

-- 1) Rewrite presets (named configs users can reuse)
create table if not exists public.rewrite_presets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  tone text not null default 'warm' check (tone in ('warm','direct','curious','authoritative')),
  length text not null default 'short' check (length in ('short','medium','long')),
  cta_style text not null default 'soft' check (cta_style in ('soft','firm','question','calendar-link')),
  personalization jsonb not null default '{"slots":["{{first_name}}","{{company}}"]}'::jsonb,
  isp_safe jsonb not null default '{"max_links":1,"caps":false,"no_spam_words":true,"line_len":72}'::jsonb,
  ab_variants int not null default 2 check (ab_variants between 1 and 5),
  unique (account_id, name)
);

create index if not exists idx_rewrite_presets_acct on public.rewrite_presets(account_id, created_at desc);

create trigger trg_rewrite_presets_updated_at
before update on public.rewrite_presets
for each row
execute function public.set_updated_at();

-- 2) Rewrite runs (audit log + rollback support)
create table if not exists public.rewrite_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  template_id uuid,
  source_text text not null,
  config jsonb not null,
  outputs jsonb not null,
  isp_key text,
  user_id uuid references auth.users(id) on delete set null
);

create index if not exists idx_rewrite_runs_acct on public.rewrite_runs(account_id, created_at desc);
create index if not exists idx_rewrite_runs_template on public.rewrite_runs(template_id, created_at desc);

-- 3) RLS
alter table public.rewrite_presets enable row level security;
alter table public.rewrite_runs    enable row level security;

create policy if not exists rw_presets_iso on public.rewrite_presets
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

create policy if not exists rw_runs_iso on public.rewrite_runs
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

