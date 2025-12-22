-- Reply composer templates, snippets, outbound logging, and helpers

-- A) Reply templates (per account; quick-pick in composer)
create table if not exists public.reply_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text,
  body text not null,
  is_shared boolean not null default true,
  unique (account_id, name)
);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_reply_templates_updated_at on public.reply_templates;
create trigger trg_reply_templates_updated_at
  before update on public.reply_templates
  for each row execute function public.update_updated_at_column();

alter table public.reply_templates enable row level security;

do $$
begin
  create policy if not exists reply_templates_rw on public.reply_templates
    for all
    using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception when duplicate_object then
  null;
end;
$$;


-- B) Reusable snippets (short inserts)
create table if not exists public.reply_snippets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  body text not null,
  unique (account_id, name)
);

drop trigger if exists trg_reply_snippets_updated_at on public.reply_snippets;
create trigger trg_reply_snippets_updated_at
  before update on public.reply_snippets
  for each row execute function public.update_updated_at_column();

alter table public.reply_snippets enable row level security;

do $$
begin
  create policy if not exists reply_snippets_rw on public.reply_snippets
    for all
    using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception when duplicate_object then
  null;
end;
$$;


-- C) Outbound replies log (normalized)
create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text not null check (provider in ('gmail','outlook')),
  provider_msg_id text,
  account_id uuid not null references auth.users(id) on delete cascade,
  identity_id uuid not null references public.send_identities(id) on delete restrict,
  thread_id uuid not null references public.reply_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  to_email text not null,
  subject text not null,
  html_body text not null,
  headers jsonb not null default '{}'::jsonb
);

create index if not exists idx_outbound_thread on public.outbound_messages(thread_id, created_at desc);

alter table public.outbound_messages enable row level security;

do $$
begin
  create policy if not exists outbound_rw on public.outbound_messages
    for all
    using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception when duplicate_object then
  null;
end;
$$;


-- D) SLA: mark first response met when we send first reply
create or replace function public.mark_first_response_met(p_thread uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reply_sla_states
    set first_met_at = coalesce(first_met_at, now()),
        updated_at = now()
  where thread_id = p_thread;
end;
$$;


-- E) Resolve merge fields helper (server-side, safe)
create or replace function public.render_reply_template(p_text text, p_lead uuid, p_identity uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text;
  v_last text;
  v_company text;
  v_my_email text;
  v_render text;
begin
  select first_name, last_name, company
    into v_first, v_last, v_company
  from public.leads
  where id = p_lead;

  select email
    into v_my_email
  from public.send_identities
  where id = p_identity;

  v_render := coalesce(p_text, '');

  v_render := replace(v_render, '{{first_name}}', coalesce(v_first, ''));
  v_render := replace(v_render, '{{last_name}}', coalesce(v_last, ''));
  v_render := replace(v_render, '{{company}}', coalesce(v_company, ''));
  v_render := replace(
    v_render,
    '{{my_name}}',
    coalesce(split_part(coalesce(v_my_email, ''), '@', 1), '')
  );

  return v_render;
end;
$$;



