-- 1) Safety: ensure leads has pause fields
do $$ begin
  alter table public.leads add column if not exists paused_until timestamptz;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.leads add column if not exists pause_reason text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.leads add column if not exists next_nudge_preset text default 'default';
exception when duplicate_column then null; end $$;

-- 2) OOO signals store
create table if not exists public.ooo_signals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  back_on_ts timestamptz,
  timezone text,
  confidence numeric check (confidence between 0 and 1),
  raw_hint text,
  status text not null default 'pending' check (status in ('pending','scheduled','resolved')),
  extra jsonb not null default '{}'::jsonb
);

create index if not exists idx_ooo_signals_lead on public.ooo_signals(lead_id);
create index if not exists idx_ooo_signals_due on public.ooo_signals(back_on_ts);

-- 3) Parse jobs queue
create table if not exists public.ooo_parse_jobs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  message_id uuid not null references public.messages(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  attempts int not null default 0,
  status text not null default 'queued' check (status in ('queued','processing','done','failed')),
  last_error text
);

create index if not exists idx_ooo_parse_jobs_status on public.ooo_parse_jobs(status);

-- 4) Enqueue OOO parse when classification stored as 'ooo'
create or replace function public.fn_after_classification_enqueue_ooo()
returns trigger language plpgsql as $$
declare
  v_msg record;
begin
  if NEW.label = 'ooo' then
    select id, account_id, lead_id into v_msg from public.messages where id = NEW.message_id;

    insert into public.ooo_signals(account_id, message_id, lead_id, confidence, raw_hint, extra)
    values (v_msg.account_id, NEW.message_id, v_msg.lead_id, NEW.confidence, null, jsonb_build_object('source', NEW.source))
    on conflict do nothing;

    insert into public.ooo_parse_jobs(message_id, account_id) values (NEW.message_id, v_msg.account_id);
  end if;
  return NEW;
end $$;

drop trigger if exists trg_after_classification_enqueue_ooo on public.message_classifications;
create trigger trg_after_classification_enqueue_ooo
after insert on public.message_classifications
for each row execute function public.fn_after_classification_enqueue_ooo();

-- 5) Helper view: leads due to resume now
create or replace view public.v_leads_due_reentry as
select
  l.id as lead_id,
  l.account_id,
  l.paused_until,
  l.next_nudge_preset,
  l.pause_reason
from public.leads l
where l.paused_until is not null
  and l.paused_until <= now()
  and coalesce(l.next_nudge_preset, 'default') in ('ooo_reentry', 'default')
  and coalesce(l.pause_reason, '') in ('ooo', 'meeting_intent', 'positive', 'bounce');

-- 6) RLS (adjust to your tenant model)
alter table public.ooo_signals enable row level security;
create policy ooo_signals_isolation on public.ooo_signals using (account_id = auth.uid());

alter table public.ooo_parse_jobs enable row level security;
create policy ooo_parse_jobs_isolation on public.ooo_parse_jobs using (account_id = auth.uid());


