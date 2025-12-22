-- Thread ownership assignments
create table if not exists public.thread_assignments (
  thread_id uuid primary key references public.inbox_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now()
);

create index if not exists idx_thread_assign_user on public.thread_assignments(user_id);

-- Internal thread notes
create table if not exists public.thread_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null
);

create index if not exists idx_thread_notes_thread on public.thread_notes(thread_id);
create index if not exists idx_thread_notes_created on public.thread_notes(created_at desc);

-- Latest thread owner (per thread)
create or replace view public.v_thread_owner as
select
  ta.thread_id,
  ta.user_id as owner_user_id,
  ta.assigned_at
from public.thread_assignments ta;

-- Enable RLS and ensure policies exist
alter table if exists public.thread_assignments enable row level security;
alter table if exists public.thread_notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'thread_assignments' and policyname = 'ta_member_select'
  ) then
    create policy ta_member_select on public.thread_assignments
      for select using (
        exists (
          select 1
          from public.campaign_members cm
          join public.inbox_threads t on t.id = thread_id
          where cm.campaign_id = t.campaign_id
            and cm.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.inbox_threads t
          join public.campaigns c on c.id = t.campaign_id
          where t.id = thread_id
            and c.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'thread_assignments' and policyname = 'ta_member_upsert'
  ) then
    create policy ta_member_upsert on public.thread_assignments
      for insert with check (
        exists (
          select 1
          from public.campaign_members cm
          join public.inbox_threads t on t.id = thread_id
          where cm.campaign_id = t.campaign_id
            and cm.user_id = auth.uid()
            and cm.role in ('owner', 'editor')
        )
        or exists (
          select 1
          from public.inbox_threads t
          join public.campaigns c on c.id = t.campaign_id
          where t.id = thread_id
            and c.user_id = auth.uid()
        )
      );

    create policy ta_member_update on public.thread_assignments
      for update using (true)
      with check (true);

    create policy ta_member_delete on public.thread_assignments
      for delete using (
        exists (
          select 1
          from public.campaign_members cm
          join public.inbox_threads t on t.id = thread_id
          where cm.campaign_id = t.campaign_id
            and cm.user_id = auth.uid()
            and cm.role in ('owner', 'editor')
        )
        or exists (
          select 1
          from public.inbox_threads t
          join public.campaigns c on c.id = t.campaign_id
          where t.id = thread_id
            and c.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'thread_notes' and policyname = 'tn_member_select'
  ) then
    create policy tn_member_select on public.thread_notes
      for select using (
        exists (
          select 1
          from public.campaign_members cm
          join public.inbox_threads t on t.id = thread_id
          where cm.campaign_id = t.campaign_id
            and cm.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.inbox_threads t
          join public.campaigns c on c.id = t.campaign_id
          where t.id = thread_id
            and c.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'thread_notes' and policyname = 'tn_member_insert'
  ) then
    create policy tn_member_insert on public.thread_notes
      for insert with check (
        exists (
          select 1
          from public.campaign_members cm
          join public.inbox_threads t on t.id = thread_id
          where cm.campaign_id = t.campaign_id
            and cm.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.inbox_threads t
          join public.campaigns c on c.id = t.campaign_id
          where t.id = thread_id
            and c.user_id = auth.uid()
        )
      );
  end if;
end$$;

-- Assign owner RPC
drop function if exists public.assign_thread_owner(uuid, uuid);

create or replace function public.assign_thread_owner(p_thread uuid, p_user uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_campaign uuid;
begin
  select t.campaign_id
    into v_campaign
  from public.inbox_threads t
  where t.id = p_thread;

  if v_campaign is null then
    raise exception 'thread not found';
  end if;

  if not exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = v_campaign
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'editor')
  )
  and not exists (
    select 1
    from public.campaigns c
    where c.id = v_campaign
      and c.user_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  insert into public.thread_assignments (thread_id, user_id)
  values (p_thread, p_user)
  on conflict (thread_id) do update
    set user_id = excluded.user_id,
        assigned_at = now();
end;
$$;

revoke all on function public.assign_thread_owner(uuid, uuid) from public;
grant execute on function public.assign_thread_owner(uuid, uuid) to authenticated, service_role;

-- Add thread note RPC
drop function if exists public.add_thread_note(uuid, text);

create or replace function public.add_thread_note(p_thread uuid, p_body text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.thread_notes (thread_id, author_id, body)
  values (p_thread, auth.uid(), p_body)
  returning id into v_id;

  update public.inbox_threads
    set updated_at = now()
  where id = p_thread;

  return v_id;
end;
$$;

revoke all on function public.add_thread_note(uuid, text) from public;
grant execute on function public.add_thread_note(uuid, text) to authenticated, service_role;

-- Inbox list enrichment with owner email
create or replace view public.v_inbox_list_enriched as
select
  v.*,
  u.email as owner_email,
  vto.owner_user_id,
  (select status from public.ooo_routes r where r.thread_id = v.thread_id) as ooo_status,
  (select followup_due_at from public.ooo_routes r where r.thread_id = v.thread_id) as ooo_due
from public.v_inbox_list v
left join public.v_thread_owner vto on vto.thread_id = v.thread_id
left join auth.users u on u.id = vto.owner_user_id;

