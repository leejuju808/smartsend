-- Inbox Threads and Reply Templates System
-- Adds threading support to inbox_messages and quick-reply templates

-- =====================================================
-- A) Add thread_key to inbox_messages
-- =====================================================
alter table public.inbox_messages
  add column if not exists thread_key text;

create index if not exists idx_inbox_thread on public.inbox_messages(thread_key);

-- Backfill helper comment (run manually if needed):
-- update public.inbox_messages set thread_key =
--   coalesce(provider_thread_id, concat_ws(':', coalesce(lead_id::text,''), coalesce(campaign_id::text,'')))
-- where thread_key is null;

-- =====================================================
-- B) Conversation state (inbox_threads)
-- =====================================================
create table if not exists public.inbox_threads (
  thread_key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.campaign_leads(id) on delete set null,
  mailbox_id uuid references public.connected_accounts(id) on delete set null,

  status text not null default 'open' check (status in ('open','snoozed','archived')),
  assignee_id uuid null references auth.users(id) on delete set null,
  last_activity timestamptz not null default now(),
  unread_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_threads_user on public.inbox_threads(user_id, status, updated_at desc);
create index if not exists idx_threads_campaign on public.inbox_threads(campaign_id);
create index if not exists idx_threads_lead on public.inbox_threads(lead_id);
create index if not exists idx_threads_mailbox on public.inbox_threads(mailbox_id);

-- RLS: visible to owner and campaign/org members
alter table public.inbox_threads enable row level security;

create policy "threads.select.members" on public.inbox_threads for select
using (
  user_id = auth.uid()
  or (campaign_id is not null and public.can_view_campaign(campaign_id))
);

-- Service role writes only; authenticated can read via RLS
revoke all on public.inbox_threads from anon;
revoke insert, update, delete on public.inbox_threads from authenticated;
grant select on public.inbox_threads to authenticated;

-- =====================================================
-- C) Quick-reply templates
-- =====================================================
create table if not exists public.reply_templates (
  id uuid primary key default gen_random_uuid(),
  owner_scope text not null check (owner_scope in ('user','org')),
  owner_id uuid not null,                     -- user_id or org_id
  name text not null,
  subject text default '',
  body_md text not null,                      -- markdown with {{variables}}
  is_shared boolean default false,            -- for org: visible to members
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(owner_scope, owner_id, name)
);

create index if not exists idx_templates_owner on public.reply_templates(owner_scope, owner_id);

alter table public.reply_templates enable row level security;

create policy "templates.select" on public.reply_templates for select
using (
  (owner_scope='user' and owner_id = auth.uid())
  or (owner_scope='org' and public.can_view_org(owner_id))
);

create policy "templates.insert" on public.reply_templates for insert
with check (
  (owner_scope='user' and owner_id = auth.uid())
  or (owner_scope='org' and public.can_edit_org(owner_id))
);

create policy "templates.update" on public.reply_templates for update
using (
  (owner_scope='user' and owner_id = auth.uid())
  or (owner_scope='org' and public.can_edit_org(owner_id))
)
with check (
  (owner_scope='user' and owner_id = auth.uid())
  or (owner_scope='org' and public.can_edit_org(owner_id))
);

create policy "templates.delete" on public.reply_templates for delete
using (
  (owner_scope='user' and owner_id = auth.uid())
  or (owner_scope='org' and public.can_edit_org(owner_id))
);

-- =====================================================
-- D) Helper function: atomic unread count increment
-- =====================================================
create or replace function public.incr_thread_unread(p_key text, p_delta int)
returns void 
language plpgsql 
security definer 
as $$
begin
  update public.inbox_threads
     set unread_count = greatest(0, unread_count + p_delta),
         last_activity = now(),
         updated_at = now()
   where thread_key = p_key;
end;
$$;

revoke all on function public.incr_thread_unread(text,int) from public;
grant execute on function public.incr_thread_unread(text,int) to service_role, authenticated;

