-- Campaign membership helpers and row-level security setup
-- Run this script in Supabase SQL. Statements are idempotent where possible.

-- A) Helpers: role checks
create or replace function public.is_campaign_viewer(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.campaign_members m
    where m.campaign_id = p_campaign
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_campaign_editor(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.campaign_members m
    where m.campaign_id = p_campaign
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  );
$$;

create or replace function public.is_campaign_owner(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.campaign_members m
    where m.campaign_id = p_campaign
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

create or replace function public.count_campaign_owners(p_campaign uuid)
returns int
language sql
stable
as $$
  select count(*)::int
  from public.campaign_members m
  where m.campaign_id = p_campaign
    and m.role = 'owner';
$$;

-- B) Ensure campaign_members exists (if already created, this is idempotent)
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  unique (campaign_id, user_id)
);

create index if not exists idx_camp_members_campaign on public.campaign_members(campaign_id);
create index if not exists idx_camp_members_user on public.campaign_members(user_id);

-- Guard: block removing or demoting the last owner
create or replace function public.tg_block_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_remaining int;
  v_is_owner_old boolean;
  v_is_owner_new boolean;
begin
  if TG_OP = 'DELETE' then
    v_campaign := OLD.campaign_id;
    v_is_owner_old := (OLD.role = 'owner');

    if v_is_owner_old then
      v_remaining := public.count_campaign_owners(v_campaign) - 1;
      if v_remaining < 1 then
        raise exception 'cannot remove the last owner of this campaign'
          using errcode = 'check_violation';
      end if;
    end if;

    return OLD;
  elsif TG_OP = 'UPDATE' then
    v_campaign := NEW.campaign_id;
    v_is_owner_old := (OLD.role = 'owner');
    v_is_owner_new := (NEW.role = 'owner');

    if v_is_owner_old and not v_is_owner_new then
      v_remaining := public.count_campaign_owners(v_campaign) - 1;
      if v_remaining < 1 then
        raise exception 'cannot demote the last owner of this campaign'
          using errcode = 'check_violation';
      end if;
    end if;

    return NEW;
  end if;

  return NEW;
end
$$;

drop trigger if exists trg_block_last_owner_del on public.campaign_members;
create constraint trigger trg_block_last_owner_del
after delete on public.campaign_members
deferrable initially immediate
for each row execute procedure public.tg_block_last_owner();

drop trigger if exists trg_block_last_owner_upd on public.campaign_members;
create constraint trigger trg_block_last_owner_upd
after update of role on public.campaign_members
deferrable initially immediate
for each row execute procedure public.tg_block_last_owner();

-- Mirror canonical owner if campaigns has campaigns.user_id
insert into public.campaign_members (campaign_id, user_id, role)
select c.id, c.user_id, 'owner'
from public.campaigns c
left join public.campaign_members m
  on m.campaign_id = c.id
 and m.role = 'owner'
where m.id is null
on conflict (campaign_id, user_id) do nothing;

-- C) Enable RLS where it matters
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_leads enable row level security;
alter table public.leads enable row level security;
alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.reply_drafts enable row level security;
alter table public.send_queue enable row level security;
alter table public.send_logs enable row level security;

-- D) Policies (viewer = read, editor = write, owner = delete)

-- campaigns
drop policy if exists "campaigns_select" on public.campaigns;
create policy "campaigns_select" on public.campaigns
for select using (public.is_campaign_viewer(id));

drop policy if exists "campaigns_insert" on public.campaigns;
create policy "campaigns_insert" on public.campaigns
for insert with check (auth.uid() is not null);

drop policy if exists "campaigns_update" on public.campaigns;
create policy "campaigns_update" on public.campaigns
for update using (public.is_campaign_editor(id))
with check (public.is_campaign_editor(id));

drop policy if exists "campaigns_delete" on public.campaigns;
create policy "campaigns_delete" on public.campaigns
for delete using (public.is_campaign_owner(id));

-- campaign_members
drop policy if exists "campmem_select" on public.campaign_members;
create policy "campmem_select" on public.campaign_members
for select using (public.is_campaign_viewer(campaign_id));

drop policy if exists "campmem_insert" on public.campaign_members;
create policy "campmem_insert" on public.campaign_members
for insert with check (public.is_campaign_owner(campaign_id));

drop policy if exists "campmem_update" on public.campaign_members;
create policy "campmem_update" on public.campaign_members
for update using (public.is_campaign_owner(campaign_id))
with check (public.is_campaign_owner(campaign_id));

drop policy if exists "campmem_delete" on public.campaign_members;
create policy "campmem_delete" on public.campaign_members
for delete using (public.is_campaign_owner(campaign_id));

-- leads (scoped via campaign_leads membership)
drop policy if exists "leads_select" on public.leads;
create policy "leads_select" on public.leads
for select using (
  exists(
    select 1
    from public.campaign_leads cl
    join public.campaign_members cm on cm.campaign_id = cl.campaign_id
    where cl.lead_id = leads.id
      and cm.user_id = auth.uid()
  )
);

-- campaign_leads
drop policy if exists "campleads_select" on public.campaign_leads;
create policy "campleads_select" on public.campaign_leads
for select using (public.is_campaign_viewer(campaign_id));

drop policy if exists "campleads_mut" on public.campaign_leads;
create policy "campleads_mut" on public.campaign_leads
for all using (public.is_campaign_editor(campaign_id))
with check (public.is_campaign_editor(campaign_id));

-- inbox_threads/messages/reply_drafts/send_queue/logs — all via campaign linkage
drop policy if exists "threads_select" on public.inbox_threads;
create policy "threads_select" on public.inbox_threads
for select using (public.is_campaign_viewer(campaign_id));

drop policy if exists "threads_update" on public.inbox_threads;
create policy "threads_update" on public.inbox_threads
for update using (public.is_campaign_editor(campaign_id))
with check (public.is_campaign_editor(campaign_id));

drop policy if exists "msgs_select" on public.inbox_messages;
create policy "msgs_select" on public.inbox_messages
for select using (
  exists (
    select 1
    from public.inbox_threads t
    where t.id = inbox_messages.thread_id
      and public.is_campaign_viewer(t.campaign_id)
  )
);

drop policy if exists "drafts_rw" on public.reply_drafts;
create policy "drafts_rw" on public.reply_drafts
for all using (
  exists (
    select 1
    from public.inbox_threads t
    where t.id = reply_drafts.thread_id
      and public.is_campaign_editor(t.campaign_id)
  )
)
with check (
  exists (
    select 1
    from public.inbox_threads t
    where t.id = reply_drafts.thread_id
      and public.is_campaign_editor(t.campaign_id)
  )
);

drop policy if exists "squeue_rw" on public.send_queue;
create policy "squeue_rw" on public.send_queue
for all using (public.is_campaign_editor(campaign_id))
with check (public.is_campaign_editor(campaign_id));

drop policy if exists "slogs_select" on public.send_logs;
create policy "slogs_select" on public.send_logs
for select using (public.is_campaign_viewer(campaign_id));

-- E) Convenience view for UI
create or replace view public.v_user_campaigns as
select
  c.id as campaign_id,
  c.name,
  c.created_at,
  cm.role
from public.campaigns c
join public.campaign_members cm
  on cm.campaign_id = c.id
where cm.user_id = auth.uid();

-- profile email mirror table (used to resolve invites by email)
create table if not exists public.profile_emails (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email citext unique not null
);


