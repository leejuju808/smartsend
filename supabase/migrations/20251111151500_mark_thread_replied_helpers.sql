-- ============================================================================
-- A) Mark thread replied helper (idempotent wrapper)
-- ============================================================================
create or replace function public.mark_thread_replied(p_thread uuid, p_reason text default 'manual')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'manual');
begin
  if p_thread is null then
    return;
  end if;

  update public.inbox_threads
     set reply_type = coalesce(reply_type, 'positive'),
         updated_at = now()
   where id = p_thread;

  update public.send_queue
     set status = 'canceled',
         canceled_reason = 'replied_' || v_reason
   where thread_id = p_thread
     and status in ('pending','queued','picked','draft','working');

  begin
    perform public.mark_thread_replied(p_thread := p_thread, p_when := now(), p_reason := v_reason);
  exception
    when undefined_function then
      -- Older schemas may not yet have the extended helper; ignore gracefully.
      null;
  end;
end;
$$;

revoke all on function public.mark_thread_replied(uuid, text) from public;
grant execute on function public.mark_thread_replied(uuid, text) to service_role;
grant execute on function public.mark_thread_replied(uuid, text) to authenticated;


-- ============================================================================
-- B) Label override audit table
-- ============================================================================
create table if not exists public.label_overrides (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  old_label text,
  new_label text,
  note text
);

create index if not exists idx_label_overrides_thread on public.label_overrides(thread_id);


-- ============================================================================
-- C) Auto-mark guard on inbound messages
-- ============================================================================
create or replace function public.auto_replied_on_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'inbound' then
    perform public.mark_thread_replied(new.thread_id, 'inbound');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_replied_on_inbound on public.inbox_messages;

create trigger trg_auto_replied_on_inbound
after insert on public.inbox_messages
for each row
execute function public.auto_replied_on_inbound();







