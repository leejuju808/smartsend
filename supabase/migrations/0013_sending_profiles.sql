-- Provider enum
do $$ begin
  create type email_provider as enum ('smtp','resend','sendgrid','mailgun','postmark');
exception when duplicate_object then null; end $$;

-- Create private schema if it doesn't exist
create schema if not exists private;

-- Public profile (no secrets)
create table if not exists public.sending_profiles (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  provider email_provider not null,
  from_name text not null,
  from_email text not null,
  signature_html text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Per-project default
alter table public.projects
  add column if not exists default_sending_profile uuid
    references public.sending_profiles(id) on delete set null;

-- Thread override (optional)
alter table public.threads
  add column if not exists sending_profile_id uuid
    references public.sending_profiles(id) on delete set null;

-- Secrets (service-role only)
create table if not exists private.sending_profile_secrets (
  profile_id uuid primary key references public.sending_profiles(id) on delete cascade,
  smtp_host text,
  smtp_port int,
  smtp_user text,
  smtp_pass text,
  smtp_secure boolean,
  api_key text,
  domain text,
  inserted_at timestamptz not null default now()
);

-- Enable RLS
alter table public.sending_profiles enable row level security;
alter table private.sending_profile_secrets enable row level security;

-- Policies for sending_profiles
create policy "members read profiles"
  on public.sending_profiles for select using (is_member(project_id));
create policy "members write profiles"
  on public.sending_profiles for insert with check (is_member(project_id));
create policy "members update profiles"
  on public.sending_profiles for update using (is_member(project_id));

-- No one (normal users) can read secrets; only service role (edge functions) can.
create policy "service role manages secrets"
  on private.sending_profile_secrets
  for all using (false) with check (false);

-- Helper to resolve which profile to use
create or replace function public.resolve_profile(p_project uuid, p_thread uuid default null)
returns uuid
language sql stable security definer set search_path=public as $$
  select coalesce(
    (select sending_profile_id from public.threads where id=p_thread and p_thread is not null),
    (select default_sending_profile from public.projects where id=p_project),
    null
  );
$$;

-- BEFORE INSERT hook: fill sender + append signature when missing
create or replace function public.apply_sending_profile()
returns trigger language plpgsql as $$
declare
  prof_id uuid;
  prof record;
begin
  if NEW.direction <> 'outbound' then
    return NEW;
  end if;

  prof_id := public.resolve_profile(NEW.project_id, NEW.thread_id);
  if prof_id is null then
    return NEW;
  end if;

  select id, from_name, from_email, signature_html
    into prof
    from public.sending_profiles
   where id = prof_id and is_active = true;

  if prof.id is null then
    return NEW;
  end if;

  if NEW.sender is null or NEW.sender = '' then
    NEW.sender := prof.from_name || ' <' || prof.from_email || '>';
  end if;

  if prof.signature_html is not null and length(trim(coalesce(NEW.body,''))) > 0 then
    if position(prof.signature_html in NEW.body) = 0 then
      NEW.body := NEW.body || E'\n\n' || prof.signature_html;
    end if;
  end if;

  return NEW;
end $$;

drop trigger if exists trg_emails_apply_profile on public.emails;
create trigger trg_emails_apply_profile
before insert on public.emails
for each row execute function public.apply_sending_profile();

-- Index for faster lookups
create index if not exists idx_sending_profiles_project on public.sending_profiles(project_id);
create index if not exists idx_threads_sending_profile on public.threads(sending_profile_id);

