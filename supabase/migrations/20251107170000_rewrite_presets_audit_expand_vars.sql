-- Rewrite presets adjustments, audit table, and expand_vars helper

-- Ensure rewrite_presets matches expected shape
create table if not exists public.rewrite_presets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  name text not null,
  tone text not null default 'professional' check (tone in ('friendly','professional','concise','assertive','warm')),
  length text not null default 'short' check (length in ('short','medium','long')),
  cta text,
  variables jsonb not null default '{}'::jsonb,
  unique (user_id, campaign_id, name)
);

create index if not exists idx_rwp_campaign on public.rewrite_presets(campaign_id);

-- Backfill / align existing columns
alter table public.rewrite_presets
  alter column tone set default 'professional';

alter table public.rewrite_presets
  alter column length set default 'short';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rewrite_presets'
      and column_name = 'extra'
  ) then
    execute 'alter table public.rewrite_presets rename column extra to variables';
  end if;
exception
  when duplicate_column then
    -- ignore race if column renamed concurrently
    null;
end $$;

alter table public.rewrite_presets
  add column if not exists variables jsonb;

update public.rewrite_presets
  set variables = '{}'::jsonb
  where variables is null;

alter table public.rewrite_presets
  alter column variables set default '{}'::jsonb;

alter table public.rewrite_presets
  alter column variables set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rewrite_presets'::regclass
      and conname = 'rewrite_presets_user_campaign_name_key'
  ) then
    alter table public.rewrite_presets
      add constraint rewrite_presets_user_campaign_name_key
        unique (user_id, campaign_id, name);
  end if;
exception
  when duplicate_object then
    null;
end $$;

-- Audit table for rewrites
create table if not exists public.rewrite_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  source text not null check (source in ('composer','followup_engine','manual')),
  input_subject text,
  input_html text,
  settings jsonb not null,
  output jsonb not null
);

create index if not exists idx_rwa_campaign_time on public.rewrite_audit(campaign_id, created_at desc);

-- expand_vars helper
create or replace function public.expand_vars(p_text text, p_vars jsonb)
returns text
language plpgsql
immutable
as $$
declare
  out text := coalesce(p_text, '');
  k text;
  v text;
begin
  if out = '' then
    return out;
  end if;

  for k, v in
    select key, coalesce(p_vars ->> key, '')
    from jsonb_object_keys(coalesce(p_vars, '{}'::jsonb)) as t(key)
  loop
    out := replace(out, '{{' || k || '}}', v);
  end loop;

  out := regexp_replace(out, '{{[^}]+}}', '', 'g');
  return out;
end
$$;

