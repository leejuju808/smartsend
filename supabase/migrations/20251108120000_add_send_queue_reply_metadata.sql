alter table public.send_queue
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete set null,
  add column if not exists source_message_id uuid references public.normalized_messages(id) on delete set null,
  add column if not exists provider_thread_id text,
  add column if not exists in_reply_to_provider_message_id text,
  add column if not exists reference_ids text[];

create index if not exists idx_send_queue_replyhint on public.send_queue(status, thread_id, source_message_id);

create or replace function public.backfill_reply_hints_from_source()
returns trigger language plpgsql as $$
begin
  if new.source_message_id is not null and (new.in_reply_to_provider_message_id is null or new.provider_thread_id is null) then
    select nm.provider_message_id, nm.provider_thread_id
      into new.in_reply_to_provider_message_id, new.provider_thread_id
    from public.normalized_messages nm
    where nm.id = new.source_message_id;
  end if;
  return new;
end$$;

drop trigger if exists trg_send_queue_replyhint on public.send_queue;
create trigger trg_send_queue_replyhint
before insert on public.send_queue
for each row execute function public.backfill_reply_hints_from_source();



