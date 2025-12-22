-- New flags on threads
alter table public.threads
  add column if not exists ai_replied boolean not null default false,
  add column if not exists ai_reply_score numeric(3,2),
  add column if not exists last_ai_check timestamptz;

-- Processing queue for inbound emails
create table if not exists public.email_inbound_queue (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null,
  email_id uuid not null references public.emails(id) on delete cascade,
  status text not null default 'queued', -- queued | processing | done | error
  attempts int not null default 0,
  last_error text,
  queued_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Indexes
create index if not exists eiq_status_idx on public.email_inbound_queue (status, queued_at);
create index if not exists eiq_email_idx on public.email_inbound_queue (email_id);

-- RLS (workers will use service role; allow selects for members for transparency)
alter table public.email_inbound_queue enable row level security;

create policy "queue readable by members"
on public.email_inbound_queue for select
  using (exists (select 1
                 from public.emails e
                 where e.id = email_inbound_queue.email_id
                   and is_member(e.project_id)));

create policy "queue insert allowed"
on public.email_inbound_queue for insert with check (true);

create policy "queue update allowed"
on public.email_inbound_queue for update using (true);

-- Enqueue every inbound email
create or replace function public.enqueue_inbound_for_ai()
returns trigger language plpgsql as $$
begin
  if NEW.direction = 'inbound' then
    insert into public.email_inbound_queue (project_id, email_id)
    values (NEW.project_id, NEW.id);
  end if;
  return NEW;
end $$;

drop trigger if exists trg_emails_enqueue_inbound on public.emails;
create trigger trg_emails_enqueue_inbound
after insert on public.emails
for each row execute function public.enqueue_inbound_for_ai();

