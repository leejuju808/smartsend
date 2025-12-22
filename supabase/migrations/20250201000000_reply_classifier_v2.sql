-- Reply Classifier v2 foundation

-- A) Normalized label catalog (extensible)
create table if not exists public.label_catalog (
  key text primary key,
  description text not null
);

insert into public.label_catalog(key, description) values
  ('action_required','Message requests an action or contains a task/ask'),
  ('question','Contains a question needing response'),
  ('positive','Positive interest or acceptance'),
  ('neutral','Acknowledgement or non-committal'),
  ('not_interested','Explicit decline or opt-out sentiment'),
  ('routing','Wants to be routed to someone or dept'),
  ('ooo','Out-of-office / vacation auto-reply'),
  ('bounce','Delivery failure / NDR')
on conflict do nothing;

-- B) Multi-label store (per message)
create table if not exists public.message_labels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message_id uuid not null references public.messages(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  label_key text not null references public.label_catalog(key),
  confidence real not null check (confidence between 0 and 1),
  source text not null default 'ai-v2',
  model text,
  version text default 'v2',
  unique (message_id, label_key)
);

create index if not exists idx_message_labels_thread on public.message_labels(thread_id);
create index if not exists idx_message_labels_label on public.message_labels(label_key);

-- C) Thread snapshot (primary + top-3)
alter table public.threads
  add column if not exists last_intent text,
  add column if not exists last_intent_confidence real,
  add column if not exists last_intent_labels text[];

-- D) OOO pattern library (editable)
create table if not exists public.ooo_patterns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pattern text not null,
  locale text default 'en',
  priority int not null default 10,
  active boolean not null default true,
  note text
);

create index if not exists idx_ooo_patterns_active on public.ooo_patterns(active, priority);

insert into public.ooo_patterns(pattern, priority, note) values
  ('\\b(out of office|OOO)\\b', 1, 'Generic OOO'),
  ('\\b(vacation|annual leave|on leave)\\b', 2, 'Leave'),
  ('\\b(back|return|available)\\s+(on|by)\\s+[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4}', 3, 'Return date explicit'),
  ('\\baway until\\s+[A-Za-z]{3,9}\\s+\\d{1,2}', 4, 'Away until <Month Day>')
on conflict do nothing;

-- E) Per-label action map (campaign-scoped overrides supported)
create table if not exists public.label_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  label_key text not null references public.label_catalog(key),
  action text not null check (
    action in (
      'pause_followups',
      'create_task',
      'route_owner',
      'schedule_followup',
      'suppress',
      'noop',
      'set_ooo'
    )
  ),
  params jsonb,
  unique (campaign_id, label_key, action)
);

insert into public.label_actions(campaign_id, label_key, action, params) values
  (null,'ooo','set_ooo','{"fallback_days":7}'),
  (null,'action_required','create_task','{"title":"Reply needed","priority":"high"}'),
  (null,'question','create_task','{"title":"Answer question","priority":"high"}'),
  (null,'routing','route_owner','{}'),
  (null,'not_interested','pause_followups','{}'),
  (null,'bounce','suppress','{}')
on conflict do nothing;

-- F) Trigger to call classifier on inbound messages
create extension if not exists pg_net;

create or replace function public.on_inbound_message_classify()
returns trigger language plpgsql as $$
declare
  edge_base text := current_setting('app.supabase_edge_base', true);
  service_jwt text := current_setting('app.service_jwt', true);
begin
  if edge_base is null or service_jwt is null then
    return new;
  end if;

  if new.direction = 'inbound' then
    perform net.http_post(
      url := edge_base || '/reply-classify-v2',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer '||service_jwt
      ),
      body := jsonb_build_object('message_id', new.id)
    );
  end if;
  return new;
end$$;

drop trigger if exists trg_inbound_message_classify on public.messages;

create trigger trg_inbound_message_classify
after insert on public.messages
for each row execute function public.on_inbound_message_classify();

