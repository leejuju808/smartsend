-- Thread delivery health & suppression flags

alter table public.threads
  add column if not exists delivery_status text check (delivery_status in ('ok','bounced','ooo')) default 'ok',
  add column if not exists suppressed boolean not null default false,
  add column if not exists last_bounce_at timestamptz,
  add column if not exists last_ooo_at timestamptz,
  add column if not exists bounce_reason text;

-- Outbox error capture (if not already present)
alter table public.email_outbox
  add column if not exists provider_status text,
  add column if not exists provider_code text;

alter table public.emails_outbox
  add column if not exists provider_status text,
  add column if not exists provider_code text;

-- Suppression rule: any suppressed thread should not get new sequence sends
create or replace function public.block_suppressed_sequences()
returns trigger language plpgsql as $$
declare thr record;
begin
  select t.suppressed into thr from public.threads t where t.id = NEW.thread_id;
  if thr.suppressed then
    raise exception 'Thread is suppressed; cannot queue sequence send';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_block_suppressed_sequences on public.emails;
create trigger trg_block_suppressed_sequences
before insert on public.emails
for each row when (NEW.direction='outbound')
execute function public.block_suppressed_sequences();

