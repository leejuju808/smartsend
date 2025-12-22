set check_function_bodies = off;

-- Message bodies table holds sanitized content for linked provider messages
create table if not exists public.message_bodies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  provider_message_id text not null,
  charset text,
  body_text text,
  body_html text,
  size_bytes int,
  sha256 text,
  fetched_at timestamptz not null default now(),
  unique (account_id, provider, provider_message_id)
);

create index if not exists idx_mb_account_mid on public.message_bodies(account_id, provider_message_id);


-- Attachment metadata table points at Supabase Storage paths
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  provider_message_id text not null,
  attachment_id text not null,
  filename text,
  mime_type text,
  size_bytes int,
  storage_path text,
  fetched_at timestamptz,
  unique (account_id, provider, provider_message_id, attachment_id)
);

create index if not exists idx_ma_account_mid on public.message_attachments(account_id, provider_message_id);


-- Lightweight flags on normalized messages to track fetched content state
alter table public.normalized_messages
  add column if not exists has_body boolean,
  add column if not exists has_attachments boolean;


-- Restrict direct access to bodies/attachments; managed by service role only
alter table public.message_bodies enable row level security;
alter table public.message_attachments enable row level security;

drop policy if exists "mb_read" on public.message_bodies;
create policy "mb_read" on public.message_bodies
  for select to authenticated
  using (false);

drop policy if exists "ma_read" on public.message_attachments;
create policy "ma_read" on public.message_attachments
  for select to authenticated
  using (false);


-- Provider message queue enhancements to support multiple job kinds
alter table public.provider_message_queue
  add column if not exists kind text not null default 'meta'
    check (kind in ('meta','full','attach'));

drop index if exists uq_pmq_dedupe;
create unique index if not exists uq_pmq_dedupe
  on public.provider_message_queue(account_id, provider, provider_message_id, kind)
  where status in ('queued','working','failed');


-- Updated enqueue helper with job kind support
drop function if exists public.enqueue_provider_messages(uuid, text, text[], timestamptz, int);

create or replace function public.enqueue_provider_messages(
  p_account uuid,
  p_provider text,
  p_ids text[],
  p_run_at timestamptz default now(),
  p_priority int default 5,
  p_kind text default 'meta'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_id text;
begin
  if p_provider not in ('gmail','outlook') then
    raise exception 'bad provider';
  end if;

  if p_kind not in ('meta','full','attach') then
    raise exception 'bad kind';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  foreach v_id in array p_ids loop
    insert into public.provider_message_queue (account_id, provider, provider_message_id, run_at, priority, kind)
    values (p_account, p_provider, v_id, p_run_at, p_priority, p_kind)
    on conflict (account_id, provider, provider_message_id, kind)
      where status in ('queued','working','failed')
    do update
      set run_at = least(public.provider_message_queue.run_at, excluded.run_at),
          priority = least(public.provider_message_queue.priority, excluded.priority);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_provider_messages(uuid, text, text[], timestamptz, int, text) from public;
grant execute on function public.enqueue_provider_messages(uuid, text, text[], timestamptz, int, text) to authenticated;
grant execute on function public.enqueue_provider_messages(uuid, text, text[], timestamptz, int, text) to service_role;


-- Trigger to enqueue full body fetches once a normalized message links to a thread
create or replace function public.tg_nm_enqueue_full()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.link_status = 'linked'
     and (old.link_status is distinct from 'linked') then
    perform public.enqueue_provider_messages(
      new.account_id,
      new.provider,
      array[new.provider_message_id],
      now(),
      4,
      'full'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_nm_enqueue_full on public.normalized_messages;
create trigger trg_nm_enqueue_full
  after update of link_status on public.normalized_messages
  for each row
  execute procedure public.tg_nm_enqueue_full();



