-- Token-based unsubscribe system for leads
-- Token table (separate from unsubscribes for audit + rotation)
create table if not exists unsubscribe_tokens (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  token text unique not null,
  created_at timestamptz default now()
);

create index if not exists idx_unsub_tokens_lead on unsubscribe_tokens(lead_id);
-- Fast lookup by token
create index if not exists idx_unsub_tokens_token on unsubscribe_tokens(token);

-- If you don't have unsubscribes yet, create (otherwise reuse your existing table):
create table if not exists unsubscribes (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  email text,
  user_agent text,
  ip text,
  created_at timestamptz default now(),
  unique(lead_id) -- global opt-out per lead
);

-- When a lead is unsubscribed, stop their active enrollments immediately
create or replace function stop_enrollments_on_unsub()
returns trigger language plpgsql as $$
begin
  update sequence_enrollments
     set status = 'stopped', next_run_at = null
   where lead_id = NEW.lead_id and status = 'active';
  return NEW;
end;
$$;

drop trigger if exists trg_stop_enrollments_on_unsub on unsubscribes;
create trigger trg_stop_enrollments_on_unsub
after insert on unsubscribes
for each row
execute function stop_enrollments_on_unsub();

-- (Optional) add a visible status for leads
alter table leads add column if not exists unsubscribed_at timestamptz;
