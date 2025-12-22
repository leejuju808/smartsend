-- SEQUENCES & STEPS
create table if not exists sequences (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists sequence_steps (
  id uuid primary key default uuid_generate_v4(),
  sequence_id uuid references sequences(id) on delete cascade,
  order_index int not null,
  delay_minutes int not null default 0,
  sender_account_id uuid references sender_accounts(id),
  subject_template text not null,
  body_text_template text,
  body_html_template text,
  stop_if_replied boolean default true,
  stop_if_bounced boolean default true,
  stop_if_unsubscribed boolean default true,
  created_at timestamptz default now(),
  unique(sequence_id, order_index)
);

alter table campaigns add column if not exists sequence_id uuid references sequences(id);

create table if not exists sequence_enrollments (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid references campaigns(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  current_step int not null default 0,
  status text check (status in ('active','paused','completed','stopped')) default 'active',
  next_run_at timestamptz,
  created_at timestamptz default now(),
  unique (campaign_id, lead_id)
);

create index if not exists idx_seq_enroll_due on sequence_enrollments(status, next_run_at);

create table if not exists send_queue (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  sender_account_id uuid references sender_accounts(id),
  provider text check (provider in ('gmail','outlook')) not null,
  payload jsonb not null,
  run_after timestamptz not null default now(),
  status text check (status in ('pending','locked','sent','error')) default 'pending',
  last_note text,
  created_at timestamptz default now()
);

create index if not exists idx_send_queue_due on send_queue(status, run_after);

create table if not exists unsubscribes (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  email text,
  created_at timestamptz default now(),
  unique(lead_id)
);

create or replace function enroll_lead(campaign uuid, lead uuid)
returns void language plpgsql as $$
declare
  first_delay int := 0;
begin
  select coalesce(min(delay_minutes),0) into first_delay
  from sequence_steps s
  join campaigns c on c.sequence_id = s.sequence_id
  where c.id = campaign;

  insert into sequence_enrollments(campaign_id, lead_id, current_step, status, next_run_at)
  values (campaign, lead, 0, 'active', now() + (first_delay || ' minutes')::interval)
  on conflict (campaign_id, lead_id) do nothing;
end;
$$;

alter table campaign_logs add column if not exists step_index int;

create or replace function advance_enrollment_on_log()
returns trigger language plpgsql as $$
declare
  seq_id uuid;
  next_delay int;
begin
  if (TG_OP = 'INSERT' and NEW.campaign_id is not null) then
    select sequence_id into seq_id from campaigns where id = NEW.campaign_id;
    if seq_id is null then return NEW; end if;

    update sequence_enrollments se
    set current_step = se.current_step + 1
    where se.campaign_id = NEW.campaign_id and se.lead_id = NEW.lead_id
      and se.status = 'active';

    select delay_minutes into next_delay
    from sequence_steps
    where sequence_id = seq_id
      and order_index = (select current_step from sequence_enrollments se where se.campaign_id = NEW.campaign_id and se.lead_id = NEW.lead_id);

    if next_delay is null then
      update sequence_enrollments
      set status = 'completed', next_run_at = null
      where campaign_id = NEW.campaign_id and lead_id = NEW.lead_id;
    else
      update sequence_enrollments
      set next_run_at = now() + (next_delay || ' minutes')::interval
      where campaign_id = NEW.campaign_id and lead_id = NEW.lead_id;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_advance_enrollment_on_log on campaign_logs;
create trigger trg_advance_enrollment_on_log
after insert on campaign_logs
for each row
execute function advance_enrollment_on_log();

create or replace function pause_enroll_on_lead_status()
returns trigger language plpgsql as $$
begin
  if NEW.status in ('Replied','Bounced') and OLD.status is distinct from NEW.status then
    update sequence_enrollments
    set status = 'stopped', next_run_at = null
    where lead_id = NEW.id and status = 'active';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_pause_enroll_on_lead_status on leads;
create trigger trg_pause_enroll_on_lead_status
after update of status on leads
for each row
execute function pause_enroll_on_lead_status();