-- Inbound reply ingestion pipeline
-- A) Reset legacy objects (safe drops)
drop trigger if exists after_classification on public.reply_classifications;
drop function if exists public.trg_after_classification() cascade;
drop function if exists public.log_reply_activity(uuid, uuid, uuid, uuid, uuid);

-- Optionally preserve legacy table by renaming; otherwise drop to rebuild schema
do $$
declare
  v_exists boolean;
begin
  select to_regclass('public.inbound_messages') is not null into v_exists;
  if v_exists then
    execute 'drop table if exists public.inbound_messages cascade';
  end if;
end $$;

-- B) Raw inbound messages (normalized envelope + headers)
create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text not null check (provider in ('gmail','outlook')),
  provider_msg_id text not null,
  provider_thread_id text,
  account_id uuid not null references auth.users(id) on delete cascade,
  identity_id uuid references public.send_identities(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  from_email text not null,
  to_email text not null,
  subject text,
  snippet text,
  text_body text,
  html_body text,
  headers jsonb not null default '{}'::jsonb,
  campaign_id uuid references public.campaigns(id) on delete set null,
  send_queue_id bigint references public.send_queue(id) on delete set null,
  in_reply_to text,
  references_ids text[] default '{}',
  received_at timestamptz not null,
  unique(provider, provider_msg_id)
);

create index if not exists idx_inbound_messages_account on public.inbound_messages(account_id, received_at desc);
create index if not exists idx_inbound_messages_lead on public.inbound_messages(lead_id, received_at desc);

-- C) Polling cursors per provider account
create table if not exists public.provider_poll_state (
  provider_account_id uuid primary key references public.provider_accounts(id) on delete cascade,
  provider text not null,
  cursor jsonb,
  updated_at timestamptz not null default now()
);

-- D) Classification results for each inbound
create table if not exists public.reply_classifications (
  inbound_id uuid primary key references public.inbound_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  label text not null,
  confidence real not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

-- E) Link back to lead/campaign state (fast guards)
alter table public.leads add column if not exists last_replied_at timestamptz;
alter table public.campaign_targets add column if not exists replied boolean not null default false;

-- F) Activity log helper
create or replace function public.log_reply_activity(
  p_account uuid,
  p_lead uuid,
  p_identity uuid,
  p_campaign uuid,
  p_inbound uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activities(account_id, lead_id, identity_id, campaign_id, kind, created_at, payload)
  values (p_account, p_lead, p_identity, p_campaign, 'reply_detected', now(), jsonb_build_object('inbound_id', p_inbound))
  on conflict do nothing;
end
$$;

-- G) Auto-actions on classification
create or replace function public.trg_after_classification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.inbound_messages%rowtype;
begin
  select * into v_record from public.inbound_messages where id = new.inbound_id;
  if v_record.id is null then
    return new;
  end if;

  -- Mark lead / campaign as replied
  if v_record.lead_id is not null then
    update public.leads
      set last_replied_at = coalesce(last_replied_at, v_record.received_at)
    where id = v_record.lead_id;
  end if;

  if v_record.lead_id is not null and v_record.campaign_id is not null then
    update public.campaign_targets
      set replied = true
    where campaign_id = v_record.campaign_id
      and lead_id = v_record.lead_id;
  end if;

  -- Log activity
  perform public.log_reply_activity(
    v_record.account_id,
    v_record.lead_id,
    v_record.identity_id,
    v_record.campaign_id,
    v_record.id
  );

  -- OOO pause: add TTL suppression (7 days)
  if new.label in ('ooO','out_of_office','vacation') then
    insert into public.account_suppressions(account_id, email, reason, expires_at)
    values (v_record.account_id, v_record.from_email, 'ooopause', now() + interval '7 days')
    on conflict (account_id, email) do update
      set reason = 'ooopause',
          expires_at = excluded.expires_at;
  end if;

  -- Unsubscribe: add permanent suppression
  if new.label in ('unsubscribe') then
    insert into public.account_suppressions(account_id, email, reason)
    values (v_record.account_id, v_record.from_email, 'unsub')
    on conflict (account_id, email) do update
      set reason = 'unsub',
          expires_at = null;
  end if;

  return new;
end
$$;

create trigger after_classification
after insert on public.reply_classifications
for each row execute function public.trg_after_classification();

-- H) Security policies
alter table public.inbound_messages enable row level security;
alter table public.provider_poll_state enable row level security;
alter table public.reply_classifications enable row level security;

-- Inbound messages: owners + service role
drop policy if exists inbound_messages_select_owner on public.inbound_messages;
create policy inbound_messages_select_owner
on public.inbound_messages
for select
to authenticated
using (account_id = auth.uid());

drop policy if exists inbound_messages_ins_service on public.inbound_messages;
create policy inbound_messages_ins_service
on public.inbound_messages
for all
to service_role
using (true)
with check (true);

-- Provider poll state (service role only)
drop policy if exists provider_poll_state_service on public.provider_poll_state;
create policy provider_poll_state_service
on public.provider_poll_state
for all
to service_role
using (true)
with check (true);

-- Reply classifications (service role insert/update, account view)
drop policy if exists reply_classifications_select_owner on public.reply_classifications;
create policy reply_classifications_select_owner
on public.reply_classifications
for select
to authenticated
using (exists (
  select 1
  from public.inbound_messages im
  where im.id = reply_classifications.inbound_id
    and im.account_id = auth.uid()
));

drop policy if exists reply_classifications_service on public.reply_classifications;
create policy reply_classifications_service
on public.reply_classifications
for all
to service_role
using (true)
with check (true);

-- Grants
grant select on public.inbound_messages to authenticated;
grant select on public.reply_classifications to authenticated;

-- I) Helper RPC for classifier queue
create or replace function public.list_unclassified_inbound(p_limit int default 100)
returns table(
  id uuid,
  account_id uuid,
  subject text,
  text_body text,
  html_body text,
  headers jsonb
)
language sql
security definer
set search_path = public
as $$
  select i.id,
         i.account_id,
         i.subject,
         i.text_body,
         i.html_body,
         i.headers
  from public.inbound_messages i
  left join public.reply_classifications c
    on c.inbound_id = i.id
  where c.inbound_id is null
  order by i.received_at desc
  limit p_limit;
$$;

grant execute on function public.list_unclassified_inbound(integer) to service_role;


