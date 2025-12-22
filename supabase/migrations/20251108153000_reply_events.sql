-- A) Columns we rely on (safe add)
alter table public.inbox_threads
  add column if not exists replied_at timestamptz,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists last_outbound_at timestamptz,
  add column if not exists needs_reply boolean not null default true;

alter table public.inbox_threads
  alter column needs_reply set default true;

alter table public.campaign_leads
  add column if not exists first_reply_at timestamptz;


-- B) Canonical reply events (idempotent + idempotency guards)
create table if not exists public.reply_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message_id uuid not null references public.normalized_messages(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  reason text not null default 'label',
  unique (message_id),
  unique (thread_id)
);

create index if not exists idx_reply_events_campaign on public.reply_events(campaign_id);
create index if not exists idx_reply_events_lead on public.reply_events(lead_id);


-- C) Helper: Which inbound labels count as a reply
create or replace function public.is_reply_label(p_label text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_label, '') in ('human_reply','question','positive','neutral','routing');
$$;


-- D) Mark thread + campaign_lead as replied (idempotent)
create or replace function public.mark_thread_replied(p_thread uuid, p_when timestamptz, p_reason text default 'label')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_lead uuid;
  v_marked_at timestamptz := coalesce(p_when, now());
begin
  select t.campaign_id, t.lead_id
    into v_campaign, v_lead
  from public.inbox_threads t
  where t.id = p_thread;

  if v_campaign is null or v_lead is null then
    return;
  end if;

  begin
    insert into public.reply_events (message_id, thread_id, campaign_id, lead_id, reason)
    values (gen_random_uuid(), p_thread, v_campaign, v_lead, coalesce(p_reason, 'label'));
  exception
    when unique_violation then
      null;
  end;

  update public.inbox_threads
     set replied_at = coalesce(replied_at, v_marked_at),
         needs_reply = false,
         last_inbound_at = greatest(coalesce(last_inbound_at, v_marked_at), v_marked_at)
   where id = p_thread;

  update public.campaign_leads
     set status = 'replied',
         first_reply_at = coalesce(first_reply_at, v_marked_at)
   where campaign_id = v_campaign
     and lead_id = v_lead
     and (status is distinct from 'replied' or first_reply_at is null);
end;
$$;

grant execute on function public.mark_thread_replied(uuid, timestamptz, text) to authenticated;


-- E) Trigger on normalized_messages: inbound + reply-like label
drop trigger if exists trg_nm_auto_reply on public.normalized_messages;
drop function if exists public.on_nm_insert_mark_reply();

create or replace function public.on_nm_insert_mark_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := new.ai_label;
  v_marked_at timestamptz := coalesce(new.sent_at, now());
begin
  if new.linked_thread_id is null then
    return new;
  end if;

  if new.direction = 'inbound' and public.is_reply_label(v_label) then
    begin
      insert into public.reply_events (message_id, thread_id, campaign_id, lead_id, reason)
      select new.id, t.id, t.campaign_id, t.lead_id, 'label'
        from public.inbox_threads t
       where t.id = new.linked_thread_id;
    exception
      when unique_violation then
        null;
    end;

    perform public.mark_thread_replied(new.linked_thread_id, v_marked_at, 'label');
  elsif new.direction = 'inbound' then
    update public.inbox_threads
       set last_inbound_at = greatest(coalesce(last_inbound_at, v_marked_at), v_marked_at)
     where id = new.linked_thread_id;
  end if;

  return new;
end;
$$;

create trigger trg_nm_auto_reply
after insert on public.normalized_messages
for each row execute function public.on_nm_insert_mark_reply();


-- F) RLS for reply_events (readable to members; write via triggers only)
alter table public.reply_events enable row level security;

drop policy if exists re_read on public.reply_events;
create policy re_read on public.reply_events
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.campaign_members m
       where m.campaign_id = reply_events.campaign_id
         and m.user_id = auth.uid()
    )
  );


-- G) Safety: ensure status enum includes 'replied' (noop if already present)
alter type public.campaign_lead_status add value if not exists 'replied';



