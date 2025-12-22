-- Inbox snippets, templates, and renderer helpers

-- =====================================================
-- 1) Snippets (short reusable inserts)
-- =====================================================

create table if not exists public.inbox_snippets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  content_html text not null,
  unique(user_id, name)
);


-- =====================================================
-- 2) Templates (full replies with {{variables}})
-- =====================================================

create table if not exists public.inbox_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject_template text,
  body_html_template text not null,
  meta jsonb not null default '{}'::jsonb,
  unique(user_id, name)
);


-- =====================================================
-- 3) Lightweight {{var}} renderer
-- =====================================================

create or replace function public.render_template(p_text text, p_vars jsonb)
returns text
language plpgsql immutable
set search_path = public
as $$
declare
  k text;
  v text;
  out text := coalesce(p_text, '');
begin
  if p_vars is null then
    return out;
  end if;

  for k, v in
    select key, coalesce(p_vars ->> key, '')
    from jsonb_object_keys(p_vars) as keys(key)
  loop
    out := replace(out, '{{' || k || '}}', v);
  end loop;

  return out;
end;
$$;


-- =====================================================
-- 4) Default snippet helper (placeholder)
-- =====================================================

create or replace function public.ensure_default_snippets()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- placeholder for future seeding logic
  return;
end;
$$;


-- =====================================================
-- 5) Row-Level Security (owner-only)
-- =====================================================

alter table public.inbox_snippets  enable row level security;
alter table public.inbox_templates enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'snip_rw_owner') then
    create policy snip_rw_owner on public.inbox_snippets
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where policyname = 'tmpl_rw_owner') then
    create policy tmpl_rw_owner on public.inbox_templates
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;


-- =====================================================
-- 6) Helpful inbox indexes
-- =====================================================

create index if not exists idx_inbox_messages_thread_created
  on public.inbox_messages(thread_id, created_at desc);

create index if not exists idx_inbox_threads_updated
  on public.inbox_threads(updated_at desc);












