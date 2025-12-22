-- Rep calendar guard schema and helpers
create extension if not exists btree_gist;

create table if not exists public.rep_calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'manual',
  title text,
  time tstzrange not null,
  unique (user_id, time)
);

create index if not exists idx_rep_blocks_user on public.rep_calendar_blocks(user_id);
create index if not exists idx_rep_blocks_time on public.rep_calendar_blocks using gist (time);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rep_blocks_no_overlap') then
    alter table public.rep_calendar_blocks
      add constraint rep_blocks_no_overlap exclude using gist (
        user_id with =,
        time with &&
      );
  end if;
end$$;

alter table public.rep_calendar_blocks enable row level security;

drop policy if exists "rep_blocks sel" on public.rep_calendar_blocks;
create policy "rep_blocks sel" on public.rep_calendar_blocks
for select using ( auth.uid() = user_id );

drop policy if exists "rep_blocks ins" on public.rep_calendar_blocks;
create policy "rep_blocks ins" on public.rep_calendar_blocks
for insert with check ( auth.uid() = user_id );

drop policy if exists "rep_blocks del" on public.rep_calendar_blocks;
create policy "rep_blocks del" on public.rep_calendar_blocks
for delete using ( auth.uid() = user_id );

create or replace function public.is_user_busy(p_user uuid, p_start timestamptz, p_end timestamptz)
returns table(busy boolean, conflicts int)
language sql security definer as $$
  select count(*) > 0 as busy,
         count(*)::int as conflicts
  from public.rep_calendar_blocks b
  where b.user_id = p_user
    and b.time && tstzrange(p_start, p_end, '[)');
$$;

create or replace function public.add_rep_block(p_start timestamptz, p_end timestamptz, p_title text default 'Hold')
returns uuid
language plpgsql security definer as $$
declare
  v_id uuid;
begin
  insert into public.rep_calendar_blocks (user_id, source, title, time)
  values (auth.uid(), 'manual', p_title, tstzrange(p_start, p_end, '[)'))
  returning id into v_id;
  return v_id;
end$$;


