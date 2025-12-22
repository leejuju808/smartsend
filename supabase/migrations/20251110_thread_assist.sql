create table if not exists public.thread_assist_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  model text not null,
  summary text,
  entities jsonb,
  suggestions jsonb,
  n_actions jsonb
);

comment on column public.thread_assist_logs.entities is 'LLM extracted entities {people:[...], company:"", ask:"", dates:[...], links:[...]}';
comment on column public.thread_assist_logs.suggestions is 'Array of suggestion drafts [{tone, subject, body}]';
comment on column public.thread_assist_logs.n_actions is 'Array of recommended actions [{key,label,meta}]';

create table if not exists public.assist_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_tone text not null default 'friendly',
  max_suggestions int not null default 3,
  updated_at timestamptz not null default now()
);

create trigger set_timestamp_before_update_assist_prefs
before update on public.assist_prefs
for each row
execute procedure public.set_updated_at();






