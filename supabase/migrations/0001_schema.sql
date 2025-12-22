-- Extensions

create extension if not exists "uuid-ossp";

create extension if not exists pg_trgm;



-- Enums

do $$ begin

  create type email_direction as enum ('inbound','outbound');

exception when duplicate_object then null; end $$;



do $$ begin

  create type thread_status as enum ('open','waiting','closed','archived');

exception when duplicate_object then null; end $$;



-- Core: projects & membership

create table if not exists public.projects (

  id uuid primary key default uuid_generate_v4(),

  name text not null,

  created_at timestamptz not null default now()

);



create table if not exists public.project_members (

  project_id uuid not null references public.projects(id) on delete cascade,

  user_id uuid not null,

  role text not null default 'member',

  added_at timestamptz not null default now(),

  primary key (project_id, user_id)

);



-- Leads belong to a project

create table if not exists public.leads (

  id uuid primary key default uuid_generate_v4(),

  project_id uuid not null references public.projects(id) on delete cascade,

  email text not null,

  name text,

  created_at timestamptz not null default now(),

  unique (project_id, email)

);



-- Threads = conversation per lead

create table if not exists public.threads (

  id uuid primary key default uuid_generate_v4(),

  project_id uuid not null references public.projects(id) on delete cascade,

  lead_id uuid not null references public.leads(id) on delete cascade,

  status thread_status not null default 'open',

  unread_count int not null default 0,

  updated_at timestamptz not null default now()

);



-- Emails in a thread

create table if not exists public.emails (

  id uuid primary key default uuid_generate_v4(),

  project_id uuid not null references public.projects(id) on delete cascade,

  thread_id uuid not null references public.threads(id) on delete cascade,

  direction email_direction not null,

  subject text,

  body text not null,

  sender text,

  recipient text,

  created_at timestamptz not null default now()

);



-- Optional outbox queue for outbound dispatch (SMTP/provider worker watches this)

create table if not exists public.email_outbox (

  id uuid primary key default uuid_generate_v4(),

  project_id uuid not null,

  email_id uuid not null references public.emails(id) on delete cascade,

  status text not null default 'queued',

  attempts int not null default 0,

  last_error text,

  queued_at timestamptz not null default now(),

  sent_at timestamptz

);

