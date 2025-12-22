create index if not exists idx_send_queue_drafts
  on public.send_queue (campaign_id, status, queued_at desc)
  where status = 'draft';

alter table public.send_queue
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_send_queue_touch on public.send_queue;

create trigger trg_send_queue_touch
before update on public.send_queue
for each row
execute function public.tg_touch_updated_at();



