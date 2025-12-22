-- 1) Canonical label enum (idempotent)
do $$
begin
  create type reply_label as enum ('positive','neutral','oos','bounce','ooo','meeting_intent');
exception
  when duplicate_object then null;
end
$$;

-- 2) Message classifications (store ensemble result + parts)
create table if not exists public.message_classifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  label reply_label not null,
  confidence numeric not null check (confidence between 0 and 1),
  via text not null,
  parts jsonb not null default '{}'::jsonb,
  unique (message_id)
);

create trigger set_message_classifications_updated_at
before update on public.message_classifications
for each row
execute function public.set_current_timestamp_updated_at();

create index if not exists idx_msgcls_account on public.message_classifications(account_id);
create index if not exists idx_msgcls_message on public.message_classifications(message_id);

-- 3) Reputation cache per sender domain + thread fingerprints
create table if not exists public.reply_reputation_cache (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  scope text not null check (scope in ('domain','thread')),
  key_text text not null,
  recent_label reply_label not null,
  confidence numeric not null check (confidence between 0 and 1),
  hits int not null default 1,
  unique (account_id, scope, key_text)
);

create index if not exists idx_rep_cache_acct_scope on public.reply_reputation_cache(account_id, scope);

-- 4) Trigger actions ledger (for observability)
create table if not exists public.classifier_actions (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  label reply_label not null,
  actions jsonb not null
);

-- 5) RLS
alter table public.message_classifications enable row level security;

do $$
begin
  create policy msgcls_iso
  on public.message_classifications
  using (account_id = auth.uid());
exception
  when duplicate_object then null;
end
$$;

alter table public.reply_reputation_cache enable row level security;

do $$
begin
  create policy repcache_iso
  on public.reply_reputation_cache
  using (account_id = auth.uid());
exception
  when duplicate_object then null;
end
$$;

alter table public.classifier_actions enable row level security;

do $$
begin
  create policy clsa_iso
  on public.classifier_actions
  using (account_id = auth.uid());
exception
  when duplicate_object then null;
end
$$;

