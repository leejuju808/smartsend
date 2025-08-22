-- Incremental updates for usage_events: add qty, daily index, and FK
alter table if exists public.usage_events
  add column if not exists qty integer not null default 1 check (qty > 0);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'usage_events_user_id_fkey'
  ) then
    alter table public.usage_events
      add constraint usage_events_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end$$;

create index if not exists idx_usage_events_user_day_kind
on public.usage_events (user_id, kind, (date_trunc('day', created_at)));

comment on table public.usage_events is 'Tracks per-user usage by kind for daily free quota and analytics';
