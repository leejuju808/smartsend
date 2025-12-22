-- User/org settings (e.g., default sender)
create table if not exists user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  org_id uuid,
  default_from_email text,
  default_signature_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists user_settings_touch on user_settings;
create trigger user_settings_touch before update on user_settings
for each row execute function touch_updated_at();

-- HTML signatures
create table if not exists email_signatures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  user_id uuid,
  name text not null,
  html text not null,
  is_default boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists email_signatures_touch on email_signatures;
create trigger email_signatures_touch before update on email_signatures
for each row execute function touch_updated_at();

-- Re-usable templates (with {{variables}})
create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  user_id uuid,
  name text not null,
  subject text not null,
  html text not null,      -- HTML version
  text text,               -- optional plain-text version
  is_shared boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists email_templates_touch on email_templates;
create trigger email_templates_touch before update on email_templates
for each row execute function touch_updated_at();

-- Store HTML on emails
alter table if exists emails
  add column if not exists html_body text,
  add column if not exists reply_to text;

